import { execCommand } from './utils.js';

// Helper to check if command exists
async function commandExists(cmd: string): Promise<boolean> {
  try {
    const { stdout } = await execCommand(`command -v ${cmd}`);
    return !!stdout;
  } catch {
    return false;
  }
}

function stripAnsi(s: string): string {
    // eslint-disable-next-line no-control-regex
    return s.replace(/\x1b\[[0-9;]*m/g, '');
}

export async function getCliStatus(cliName: string): Promise<string | null> {
  if (cliName === 'codex') {
    try {
      const { stdout, stderr } = await execCommand('codex login status', 8000);
      const output = stdout || stderr;
      if (!output) return null;
      const clean = stripAnsi(output);
      const m = clean.match(/Logged in using\s+(.+)/i);
      if (m) return `已登录 (${m[1].trim()})`;
      if (clean.toLowerCase().includes('logged in')) return '已登录';
    } catch {
      return null;
    }
    return null;
  }

  if (cliName === 'gemini') {
    // Gemini CLI check
    if (await commandExists('gemini')) {
      return '已安装（用量见控制台或 config）';
    }
    return null;
  }

  if (cliName === 'cursor-agent') {
    const { stdout } = await execCommand('cursor-agent status', 15000);
    if (!stdout) return null;
    const clean = stripAnsi(stdout);
    const m = clean.match(/Logged in as\s+(.+?)(\n|$)/i);
    if (m) return `已登录 (${m[1].trim()})`;
    if (clean.toLowerCase().includes('logged in')) return '已登录';
    return null;
  }

  if (cliName === 'claude') {
    return null;
  }

  return null;
}
