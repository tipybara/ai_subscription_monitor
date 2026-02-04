import axios from 'axios';
import { ProviderBase, SubscriptionInfo } from './base.js';
import { getKeychainPassword } from '../keychain_cache.js';

const ANTHROPIC_DASHBOARD = "https://console.anthropic.com/settings/usage";

interface ClaudeCredentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  subscriptionType?: string;
  rateLimitTier?: string;
}

async function readClaudeCredentials(): Promise<ClaudeCredentials | null> {
  const raw = await getKeychainPassword('Claude Code-credentials');
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    const oauth = data.claudeAiOauth;
    if (!oauth?.accessToken) return null;
    return {
      accessToken: oauth.accessToken,
      refreshToken: oauth.refreshToken,
      expiresAt: oauth.expiresAt,
      subscriptionType: oauth.subscriptionType,
      rateLimitTier: oauth.rateLimitTier
    };
  } catch {
    return null;
  }
}



async function fetchUsage(token: string): Promise<{ data: any; isAuthError: boolean }> {
  try {
    const resp = await axios.get("https://api.anthropic.com/api/oauth/usage", {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "ai-subscription-monitor/0.1",
        "anthropic-beta": "oauth-2025-04-20"
      },
      timeout: 10000
    });
    return { data: resp.data, isAuthError: false };
  } catch (e: any) {
    if (e.response?.status === 401) {
      return { data: null, isAuthError: true };
    }
    return { data: null, isAuthError: false };
  }
}

async function fetchProfile(token: string): Promise<{ email: string | null; plan: string | null }> {
  try {
    const resp = await axios.get("https://api.anthropic.com/api/oauth/profile", {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "ai-subscription-monitor/0.1",
        "anthropic-beta": "oauth-2025-04-20"
      },
      timeout: 10000
    });
    const account = resp.data?.account || {};
    const org = resp.data?.organization || {};
    return { 
      email: account.email || null, 
      plan: org.organization_type || null 
    };
  } catch {
    return { email: null, plan: null };
  }
}

function formatUsage(data: any): string {
  const parts: string[] = [];
  const windows = [
    { key: "five_hour", label: "5h Window" },
    { key: "seven_day", label: "7d Window" }
  ];

  for (const w of windows) {
    const entry = data[w.key];
    if (entry && entry.utilization != null) {
      const util = entry.utilization;
      const resets = entry.resets_at;
      let resetStr = "";
      if (resets) {
        try {
          const dt = new Date(resets);
          // format: MM-dd HH:mm UTC+8 (using local time)
          const m = (dt.getMonth() + 1).toString().padStart(2, '0');
          const d = dt.getDate().toString().padStart(2, '0');
          const h = dt.getHours().toString().padStart(2, '0');
          const min = dt.getMinutes().toString().padStart(2, '0');
          
          // Get timezone offset string e.g. +08
          // But user wants explicit timezone label like CST or +08
          // Simple approach:
          resetStr = `${m}-${d} ${h}:${min}`; 
          
          // Add timezone offset logic if needed, or just let user infer from local time
          // Python used .astimezone() which defaults to local.
          // JS new Date() is local by default.
          // To add timezone suffix:
          const offset = -dt.getTimezoneOffset() / 60;
          const sign = offset >= 0 ? '+' : '-';
          resetStr += ` ${sign}${Math.abs(offset).toString().padStart(2, '0')}`;
        } catch {
          resetStr = resets.substring(0, 16);
        }
      }
      const suffix = resetStr ? `  Reset: ${resetStr}` : "";
      parts.push(`${w.label}: ${util.toFixed(0)}%${suffix}`);
    }
  }
  return parts.join("\n");
}

export class AnthropicProvider extends ProviderBase {
  name = "Claude (Anthropic)";
  dashboard_url = ANTHROPIC_DASHBOARD;
  cli_name = "claude";

  async fetch(): Promise<SubscriptionInfo> {
    let error: string | undefined;
    let usage = "";
    let statusLine = "";

    let creds = await readClaudeCredentials();
    
    if (creds) {
      // Fetch profile to get email and plan
      const profile = await fetchProfile(creds.accessToken);
      const subType = creds.subscriptionType || "unknown";
      const subMap: Record<string, string> = {
        "pro": "Claude Pro",
        "free": "Claude Free",
        "team": "Claude Team"
      };
      const planName = subMap[subType] || subType;
      
      if (profile.email) {
        statusLine = `Logged in (${profile.email} - ${planName})`;
      } else {
        statusLine = `Logged in (${planName})`;
      }
      
      const result = await fetchUsage(creds.accessToken);
      
      if (result.data) {
        usage = formatUsage(result.data);
      } else if (result.isAuthError && creds.refreshToken) {
        error = "Token expired, please run claude CLI to re-login";
      } else {
        error = "Failed to fetch usage";
      }
    } else {
      statusLine = "Claude login not detected";
    }

    if (!usage) {
      usage = this.manual.usage_text || "";
    }

    const fullUsage = usage ? `${statusLine}\n${usage}` : statusLine;

    return {
      name: this.name,
      usage_text: fullUsage.trim() || "—",
      reset_time: "",
      limit_note: this.manual.limit_note || "Pro: 5h/7d sliding window limit",
      dashboard_url: this.dashboard_url,
      error
    };
  }
}
