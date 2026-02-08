import axios from 'axios';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { getCliStatus } from '../cli_runner.js';
import { ProviderBase, SubscriptionInfo } from './base.js';
import { parseJwt } from '../utils.js';

const OPENAI_DASHBOARD = "https://chatgpt.com/codex/settings/usage";

function getXdgConfigHome(): string {
  return process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
}

function getAuthPath() {
  return path.join(getXdgConfigHome(), 'ai_subscription_monitor', 'codex_auth.json');
}

function getLegacyAuthPath() {
  return path.join(os.homedir(), '.codex', 'auth.json');
}

function migrateFromLegacy(): boolean {
  try {
    const legacyPath = getLegacyAuthPath();
    const newPath = getAuthPath();
    
    if (fs.existsSync(newPath)) return false;
    if (!fs.existsSync(legacyPath)) return false;
    
    const data = fs.readFileSync(legacyPath, 'utf8');
    fs.mkdirSync(path.dirname(newPath), { recursive: true });
    fs.writeFileSync(newPath, data);
    return true;
  } catch {
    return false;
  }
}

function readCodexAuth(): { token: string | null; accountId: string | null; email: string | null } {
  try {
    migrateFromLegacy();
    
    const authPath = getAuthPath();
    if (!fs.existsSync(authPath)) return { token: null, accountId: null, email: null };
    
    const content = fs.readFileSync(authPath, 'utf8');
    const data = JSON.parse(content);
    const tokens = data.tokens || {};
    const token = tokens.access_token || null;
    let email: string | null = null;
    
    if (tokens.id_token) {
        const decoded = parseJwt(tokens.id_token);
        if (decoded && decoded.email) {
            email = decoded.email;
        }
    }
    
    return { token, accountId: tokens.account_id || null, email };
  } catch {
    return { token: null, accountId: null, email: null };
  }
}

async function fetchOpenAIUsage(token: string, accountId: string) {
  try {
    const resp = await axios.get("https://chatgpt.com/backend-api/wham/usage", {
      headers: {
        "Authorization": `Bearer ${token}`,
        "User-Agent": "codex/0.93.0",
        "ChatGPT-Account-Id": accountId
      },
      timeout: 10000
    });
    return resp.data;
  } catch {
    return null;
  }
}

function formatOpenAI(data: any): string {
  const planType = data.plan_type || "unknown";
  const planMap: Record<string, string> = {
    "plus": "ChatGPT Plus",
    "pro": "ChatGPT Pro",
    "team": "ChatGPT Team",
    "enterprise": "ChatGPT Enterprise",
    "free": "ChatGPT Free"
  };
  const planName = planMap[planType] || planType;

  const parts = [`Plan: ${planName}`];
  const rateLimit = data.rate_limit || {};
  const primary = rateLimit.primary_window;
  const secondary = rateLimit.secondary_window;

  function formatReset(ts: number, fmt: 'hm' | 'mdhm') {
      try {
        const dt = new Date(ts * 1000);
        const m = (dt.getMonth() + 1).toString().padStart(2, '0');
        const d = dt.getDate().toString().padStart(2, '0');
        const h = dt.getHours().toString().padStart(2, '0');
        const min = dt.getMinutes().toString().padStart(2, '0');
        const offset = -dt.getTimezoneOffset() / 60;
        const sign = offset >= 0 ? '+' : '-';
        const zone = `${sign}${Math.abs(offset).toString().padStart(2, '0')}`;

        if (fmt === 'hm') return `${h}:${min} ${zone}`;
        return `${m}-${d} ${h}:${min} ${zone}`;
      } catch {
          return '';
      }
  }

  if (primary) {
      const pct = primary.used_percent || 0;
      const resetAt = primary.reset_at;
      const windowSec = primary.limit_window_seconds || 18000;
      const label = windowSec >= 3600 ? `${Math.floor(windowSec / 3600)}h` : `${Math.floor(windowSec / 60)}m`;
      
      let resetStr = "";
      if (resetAt) {
          resetStr = `  Reset: ${formatReset(resetAt, 'mdhm')}`;
      }
      parts.push(`${label} Limit: ${pct}%${resetStr}`);
  }

  if (secondary) {
      const pct = secondary.used_percent || 0;
      const resetAt = secondary.reset_at;
      const windowSec = secondary.limit_window_seconds || 604800;
      let label = "";
      if (windowSec >= 86400) label = `${Math.floor(windowSec / 86400)}d`;
      else label = `${Math.floor(windowSec / 3600)}h`;

      let resetStr = "";
      if (resetAt) {
          resetStr = `  Reset: ${formatReset(resetAt, 'mdhm')}`;
      }
      parts.push(`${label} Limit: ${pct}%${resetStr}`);
  }

  return parts.join("\n");
}

export class OpenAIProvider extends ProviderBase {
  name = "OpenAI (Codex)";
  dashboard_url = OPENAI_DASHBOARD;
  cli_name = "codex";

  async fetch(): Promise<SubscriptionInfo> {
    let status = await getCliStatus(this.cli_name);
    let error: string | undefined;
    let usage = "";
    
    const { token, accountId, email } = readCodexAuth();
    if (token && accountId) {
        if (email) {
            status = `Logged in (${email})`;
        }
        
        const data = await fetchOpenAIUsage(token, accountId);
        if (data) {
            usage = formatOpenAI(data);
        } else {
            error = "Failed to fetch usage";
        }
    }

    if (!usage) {
        usage = this.manual.usage_text || "";
    }

    const statusLine = status || "Codex login not detected";
    const fullUsage = usage ? `${statusLine}\n${usage}` : statusLine;

    return {
      name: this.name,
      usage_text: fullUsage.trim() || "—",
      reset_time: this.manual.reset_time || "",
      limit_note: this.manual.limit_note || "",
      dashboard_url: this.dashboard_url,
      error
    };
  }

  async autoLogin(): Promise<boolean> {
    // OpenAI/Codex 使用浏览器 OAuth 登录，不支持命令行自动登录
    console.log(`[${this.name}] 请手动运行 'codex login' 命令登录`);
    return false;
  }
}
