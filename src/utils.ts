import { exec, spawn } from 'child_process';
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

export async function runInteractiveCommand(
  command: string,
  timeout = 120000
): Promise<{ exitCode: number | null; timedOut: boolean }> {
  return await new Promise((resolve) => {
    let settled = false;
    const child = spawn(command, {
      shell: true,
      stdio: 'inherit',
    });

    const finish = (exitCode: number | null, timedOut: boolean): void => {
      if (settled) return;
      settled = true;
      resolve({ exitCode, timedOut });
    };

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      finish(null, true);
    }, timeout);

    child.on('exit', (code) => {
      clearTimeout(timer);
      finish(code, false);
    });

    child.on('error', () => {
      clearTimeout(timer);
      finish(1, false);
    });
  });
}

export function runDetachedCommand(command: string): boolean {
  try {
    if (process.platform === 'darwin') {
      const escaped = command.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const script = `tell application "Terminal" to activate\ntell application "Terminal" to do script "${escaped}"\nend tell`;
      const child = spawn('osascript', ['-e', script], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
      return true;
    }

    const child = spawn(command, {
      shell: true,
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

export function runBackgroundCommand(command: string): boolean {
  try {
    const child = spawn(command, {
      shell: true,
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    return true;
  } catch {
    return false;
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
