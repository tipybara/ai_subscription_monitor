import axios from 'axios';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { getCliStatus } from '../cli_runner.js';
import { ProviderBase, SubscriptionInfo } from './base.js';
import { parseJwt, runBackgroundCommand } from '../utils.js';

const GEMINI_DASHBOARD = "https://gemini.google.com";
const GEMINI_API_BASE = "https://cloudcode-pa.googleapis.com";
const LOGIN_COOLDOWN_MS = 120000;
let lastLoginLaunchAt = 0;

const CLIENT_ID = process.env.GEMINI_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GEMINI_CLIENT_SECRET || '';

function getXdgConfigHome(): string {
  return process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
}

function getCredsPath() {
  return path.join(getXdgConfigHome(), 'ai_subscription_monitor', 'gemini_oauth_creds.json');
}

function getLegacyCredsPath() {
  return path.join(os.homedir(), '.gemini', 'oauth_creds.json');
}

function migrateFromLegacy(): boolean {
  try {
    const legacyPath = getLegacyCredsPath();
    const newPath = getCredsPath();
    
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

function readGeminiCreds(): any {
  try {
    // Always read from the Gemini CLI's actual location first
    // This ensures we get the most up-to-date credentials
    const legacyPath = getLegacyCredsPath();
    if (fs.existsSync(legacyPath)) {
      return JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
    }
    
    // Fallback to migrated location
    const p = getCredsPath();
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function saveGeminiCreds(data: any) {
  try {
    const current = readGeminiCreds() || {};
    Object.assign(current, data);
    const p = getCredsPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(current, null, 2));
  } catch {
    // ignore
  }
}

async function refreshAccessToken(refreshToken: string) {
  if (!CLIENT_ID || !CLIENT_SECRET) return null;
  try {
    const resp = await axios.post("https://oauth2.googleapis.com/token", {
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    }, { timeout: 10000 });
    return resp.data;
  } catch {
    return null;
  }
}

async function getProjectId(token: string): Promise<{ projectId: string | null; isAuthError: boolean }> {
  try {
    const resp = await axios.post(
      `${GEMINI_API_BASE}/v1internal:loadCodeAssist`,
      { metadata: {} },
      {
        headers: { "Authorization": `Bearer ${token}` },
        timeout: 10000
      }
    );
    return { projectId: resp.data.cloudaicompanionProject, isAuthError: false };
  } catch (e: any) {
    if (e.response?.status === 401) return { projectId: null, isAuthError: true };
    return { projectId: null, isAuthError: false };
  }
}

async function getQuota(token: string, projectId: string) {
  try {
    const resp = await axios.post(
      `${GEMINI_API_BASE}/v1internal:retrieveUserQuota`,
      { project: projectId },
      {
        headers: { "Authorization": `Bearer ${token}` },
        timeout: 10000
      }
    );
    return resp.data.buckets || [];
  } catch {
    return null;
  }
}

function formatQuota(buckets: any[]): { usage: string; resetTime: string } {
  const parts: string[] = [];
  let earliestReset = "";
  
  // Sort by modelId
  buckets.sort((a, b) => (a.modelId || "").localeCompare(b.modelId || ""));

  const maxLen = buckets.reduce((max, b) => Math.max(max, (b.modelId || "unknown").length), 0);

  for (const b of buckets) {
    const model = b.modelId || "unknown";
    const remainingFrac = b.remainingFraction;
    const resetTime = b.resetTime;

    if (remainingFrac !== undefined && remainingFrac !== null) {
      const usedPct = (1 - remainingFrac) * 100;
      const padding = " ".repeat(Math.max(0, maxLen - model.length));
      parts.push(`${model}${padding} : ${usedPct.toFixed(1)}% Used`);
    }

    if (resetTime) {
      if (!earliestReset || resetTime < earliestReset) {
        earliestReset = resetTime;
      }
    }
  }

  let resetStr = "";
  if (earliestReset) {
      try {
          const dt = new Date(earliestReset);
           // Format: MM-dd HH:mm UTC+8
          const m = (dt.getMonth() + 1).toString().padStart(2, '0');
          const d = dt.getDate().toString().padStart(2, '0');
          const h = dt.getHours().toString().padStart(2, '0');
          const min = dt.getMinutes().toString().padStart(2, '0');
          const offset = -dt.getTimezoneOffset() / 60;
          const sign = offset >= 0 ? '+' : '-';
          const zone = `${sign}${Math.abs(offset).toString().padStart(2, '0')}`;
          
          resetStr = `Reset: ${m}-${d} ${h}:${min} ${zone}`;
      } catch {
          resetStr = `Reset: ${earliestReset.substring(0, 16)}`;
      }
  }

  return { usage: parts.join("\n"), resetTime: resetStr };
}

export class GeminiProvider extends ProviderBase {
  name = "Google Gemini";
  dashboard_url = GEMINI_DASHBOARD;
  cli_name = "gemini";

  async fetch(): Promise<SubscriptionInfo> {
    let status = await getCliStatus(this.cli_name);
    let error: string | undefined;
    let usage = "";
    let resetTime = "";
    let authInProgress = false;

    const missingOauth = !CLIENT_ID || !CLIENT_SECRET;

    const creds = readGeminiCreds();
    if (creds) {
      // Extract email from id_token
      let email: string | null = null;
      if (creds.id_token) {
        const decoded = parseJwt(creds.id_token);
        if (decoded && decoded.email) {
          email = decoded.email;
        }
      }
      
      // Update status with email
      if (email) {
        status = `Logged in (${email})`;
      }
      
      let token = creds.access_token;
      let refreshToken = creds.refresh_token;

      let { projectId, isAuthError } = token ? await getProjectId(token) : { projectId: null, isAuthError: true };

      if ((isAuthError || !token) && refreshToken) {
          const newTokens = await refreshAccessToken(refreshToken);
          if (newTokens) {
              saveGeminiCreds(newTokens);
              token = newTokens.access_token;
              const res = await getProjectId(token);
              projectId = res.projectId;
              isAuthError = res.isAuthError;
          }
      }

      if (projectId && token) {
          const buckets = await getQuota(token, projectId);
          if (buckets) {
              const res = formatQuota(buckets);
              usage = res.usage;
              resetTime = res.resetTime;
          } else {
              error = "Failed to fetch usage";
          }
      } else if (isAuthError) {
          // 自动登录流程
          console.log(`[${this.name}] Token 失效，尝试自动登录...`);
          const loginSuccess = await this.autoLogin();
          if (loginSuccess) {
              // 登录成功后重新读取凭证并获取数据
              const newCreds = readGeminiCreds();
              if (newCreds?.access_token) {
                  const res = await getProjectId(newCreds.access_token);
                  if (res.projectId) {
                      const buckets = await getQuota(newCreds.access_token, res.projectId);
                      if (buckets) {
                          const formatted = formatQuota(buckets);
                          usage = formatted.usage;
                          resetTime = formatted.resetTime;
                          error = undefined;
                      }
                  }
              }
          }
          if (!usage) {
              if (loginSuccess) {
                authInProgress = true;
                status = email ? `Re-auth in progress (${email})` : 'Re-auth in progress';
                error = "Authentication expired. Auto refresh triggered in background; waiting next refresh.";
              } else if (missingOauth) {
                error = "Token expired. Please run 'gemini' CLI to refresh.";
              } else {
                error = "Authentication failed (cannot refresh token)";
              }
          }
      } else {
          error = "Failed to get project ID";
      }
    } else {
        // 没有凭证，尝试自动登录
        console.log(`[${this.name}] 未检测到登录凭证，尝试自动登录...`);
        const loginSuccess = await this.autoLogin();
        if (loginSuccess) {
            const newCreds = readGeminiCreds();
            if (newCreds?.access_token) {
                const res = await getProjectId(newCreds.access_token);
                if (res.projectId) {
                    const buckets = await getQuota(newCreds.access_token, res.projectId);
                    if (buckets) {
                        const formatted = formatQuota(buckets);
                        usage = formatted.usage;
                        resetTime = formatted.resetTime;
                        error = undefined;
                    }
                }
            }
        }
        if (!usage) {
            if (loginSuccess) {
              authInProgress = true;
              status = 'Re-auth in progress';
              error = "Auto refresh triggered in background; waiting next refresh.";
            } else if (missingOauth) {
              error = "Missing GEMINI_CLIENT_ID / GEMINI_CLIENT_SECRET";
            } else {
              const expectedPath = getCredsPath();
              error = `Not found: ${expectedPath}`;
            }
        }
    }

    if (!usage) {
        usage = this.manual.usage_text || "";
    }
    if (!resetTime) {
        resetTime = this.manual.reset_time || "Sliding window";
    }

    const statusLine = status || (authInProgress ? 'Re-auth in progress' : "Gemini CLI not detected");
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

  async autoLogin(): Promise<boolean> {
    if (Date.now() - lastLoginLaunchAt < LOGIN_COOLDOWN_MS) {
      console.log(`[${this.name}] 登录流程已在后台启动，等待完成`);
      return true;
    }

    console.log(`[${this.name}] 正在后台启动自动登录流程...`);
    try {
      const started = runBackgroundCommand('gemini -p "ping" --output-format json >/dev/null 2>&1');
      if (started) {
        lastLoginLaunchAt = Date.now();
        console.log(`[${this.name}] 已在后台触发 gemini 刷新`);
        return true;
      }

      console.error(`[${this.name}] 自动登录失败 (无法启动登录命令)`);
      return false;
    } catch (error: any) {
      console.error(`[${this.name}] 自动登录出错: ${error.message || error}`);
      return false;
    }
  }
}
