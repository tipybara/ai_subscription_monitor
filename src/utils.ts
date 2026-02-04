import { exec } from 'child_process';
import { promisify } from 'util';
import stringWidth from 'string-width';
import chalk from 'chalk';

const execAsync = promisify(exec);

export async function execCommand(command: string, timeout = 5000): Promise<{ stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execAsync(command, { timeout });
    return { stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (error: any) {
    if (error.stdout || error.stderr) {
      return { 
        stdout: (error.stdout || '').trim(), 
        stderr: (error.stderr || '').trim() 
      };
    }
    return { stdout: '', stderr: error.message || '' };
  }
}

export function displayWidth(s: string): number {
  return stringWidth(s);
}

// CJK-aware left justification
export function ljustCJK(s: string, width: number): string {
  const dw = displayWidth(s);
  if (dw >= width) return s;
  return s + ' '.repeat(width - dw);
}

const BAR_WIDTH = 30;

export function renderBar(ratio: number, maxPctWidth: number = 4): string {
  ratio = Math.max(0.0, Math.min(1.0, ratio));
  const filled = Math.floor(ratio * BAR_WIDTH);
  const empty = BAR_WIDTH - filled;
  
  let colorFn = chalk.green;
  if (ratio >= 0.9) colorFn = chalk.red;
  else if (ratio >= 0.7) colorFn = chalk.yellow;

  const bar = colorFn('█'.repeat(filled)) + chalk.dim('░'.repeat(empty));
  const pctStr = `${(ratio * 100).toFixed(0)}%`;
  const pct = chalk.bold(colorFn(pctStr.padStart(maxPctWidth)));
  
  return `${bar} ${pct}`;
}

export function parseJwt(token: string): any {
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}
