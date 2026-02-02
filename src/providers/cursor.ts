import axios from 'axios';
import { getCliStatus } from '../cli_runner.js';
import { ProviderBase, SubscriptionInfo } from './base.js';
import { getKeychainPassword } from '../keychain_cache.js';

const CURSOR_DASHBOARD = "https://cursor.com/settings";

async function readCursorToken(): Promise<string | null> {
  return await getKeychainPassword('cursor-access-token');
}

async function cursorApi(token: string, method: string) {
  try {
    const resp = await axios.post(
      `https://api2.cursor.sh/aiserver.v1.DashboardService/${method}`,
      {},
      {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        timeout: 10000
      }
    );
    return resp.data;
  } catch {
    return null;
  }
}

async function formatCursor(token: string) {
  const [fast, planInfo, events, hardLimit] = await Promise.all([
    cursorApi(token, "GetFastRequests"),
    cursorApi(token, "GetPlanInfo"),
    cursorApi(token, "GetFilteredUsageEvents"),
    cursorApi(token, "GetHardLimit")
  ]);

  const parts: string[] = [];
  let error: string | undefined;

  if (planInfo?.planInfo) {
    parts.push(`Plan: ${planInfo.planInfo.planName || '?'}`);
  }

  const quota = fast?.requestQuota || 0;
  let used = 0;
  if (events) {
    used = events.totalUsageEventsCount || 0;
  }

  if (quota > 0) {
    const pct = (used / quota) * 100;
    parts.push(`快速请求: ${pct.toFixed(0)}%  (${used}/${quota})`);
  } else if (used > 0) {
    parts.push(`已用请求: ${used}`);
  }

  if (hardLimit && hardLimit.hardLimit) {
    parts.push(`额外额度: $${hardLimit.hardLimit}`);
  }

  let resetTime = "";
  if (planInfo?.planInfo?.billingCycleEnd) {
    try {
      const ts = Number(planInfo.planInfo.billingCycleEnd);
      const dt = new Date(ts);
      // Format: YYYY-MM-dd UTC+8
      const y = dt.getFullYear();
      const m = (dt.getMonth() + 1).toString().padStart(2, '0');
      const d = dt.getDate().toString().padStart(2, '0');
      
      const offset = -dt.getTimezoneOffset() / 60;
      const sign = offset >= 0 ? '+' : '-';
      const zone = `${sign}${Math.abs(offset).toString().padStart(2, '0')}`;
      
      resetTime = `周期结束: ${y}-${m}-${d} ${zone}`;
    } catch {
      // ignore
    }
  }

  if (parts.length === 0) {
    error = "获取用量失败";
  }

  return { usage: parts.join("\n"), resetTime, error };
}

export class CursorProvider extends ProviderBase {
  name = "Cursor";
  dashboard_url = CURSOR_DASHBOARD;
  cli_name = "cursor-agent";

  async fetch(): Promise<SubscriptionInfo> {
    const status = await getCliStatus(this.cli_name);
    let error: string | undefined;
    let usage = "";
    let resetTime = "";

    const token = await readCursorToken();
    if (token) {
      const res = await formatCursor(token);
      usage = res.usage;
      resetTime = res.resetTime;
      error = res.error;
    }

    if (!usage) {
      usage = this.manual.usage_text || "";
    }
    if (!resetTime) {
      resetTime = this.manual.reset_time || "每月订阅日";
    }

    const statusLine = status || "未检测到 cursor-agent 登录";
    const fullUsage = usage ? `${statusLine}\n${usage}` : statusLine;

    return {
      name: this.name,
      usage_text: fullUsage.trim() || "—",
      reset_time: resetTime,
      limit_note: this.manual.limit_note || "",
      dashboard_url: this.dashboard_url,
      error
    };
  }
}
