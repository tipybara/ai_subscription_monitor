#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import boxen from 'boxen';
import { loadConfig } from './config.js';
import { OpenAIProvider } from './providers/openai.js';
import { GeminiProvider } from './providers/gemini.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { CursorProvider } from './providers/cursor.js';
import { SubscriptionInfo, ProviderBase } from './providers/base.js';
import { renderBar, ljustCJK, displayWidth } from './utils.js';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read version from package.json
let version = '0.0.0';
try {
    const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'));
    version = pkg.version;
} catch (e) {
    // ignore
}

const program = new Command();

program
  .name('ai-sub')
  .description('Monitor AI subscription usage')
  .version(version)
  .option('-C, --config-dir <path>', 'Path to config directory', '.')
  .option('-p, --provider <name...>', 'Specific providers to check (openai, gemini, claude, cursor)')
  .option('-i, --interval <seconds>', 'Refresh interval in seconds', parseInt)
  .option('--once', 'Run once and exit');

program.parse();

const options = program.opts();

const PROVIDERS: Record<string, any> = {
    openai: OpenAIProvider,
    gemini: GeminiProvider,
    claude: AnthropicProvider,
    cursor: CursorProvider
};

const cachedResults: Record<string, SubscriptionInfo | null> = {};

async function updateProvider(key: string, config: any) {
    const ProviderClass = PROVIDERS[key];
    if (!ProviderClass) return;
    
    try {
        const manual = config.manual || {};
        const inst = new ProviderClass(manual[key] || {});
        const result = await inst.fetch();
        if (result) {
            cachedResults[key] = result;
            render();
        }
    } catch (e) {
        // keep old data on error, or update if critical
        // console.error(e);
    }
}

function render() {
    let output = '';
    
    // Timestamp
    output += chalk.dim(new Date().toLocaleString()) + '\n\n';

    // Render panels in fixed order
    const allKeys = Object.keys(PROVIDERS);
    let hasContent = false;
    
    for (const key of allKeys) {
        if (cachedResults[key]) {
            output += renderPanel(cachedResults[key]!) + '\n';
            hasContent = true;
        }
    }
    
    if (!hasContent) {
        output += chalk.dim('Loading subscriptions...') + '\n';
    }

    console.clear();
    console.log(output);
}

function renderPanel(info: SubscriptionInfo): string {
    const lines: string[] = [];
    
    if (info.error) {
        lines.push(`${chalk.yellow('⚠')} ${chalk.red(info.error)}`);
    }

    const usageLines = info.usage_text.split('\n');
    let maxLabelWidth = 0;

    // First pass to calculate max label width for alignment
    // Regex matches "Label: 45%"
    const barRegex = /^(.+?):\s*(\d+(?:\.\d+)?)\s*%/;
    
    for (const line of usageLines) {
        if (!line.trim() || line === '—') continue;
        const m = line.match(barRegex);
        if (m) {
            maxLabelWidth = Math.max(maxLabelWidth, displayWidth(m[1].trim()));
        }
    }

    for (const line of usageLines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === '—') continue;

        const m = trimmed.match(barRegex);
        if (m) {
            const label = m[1].trim();
            const pct = parseFloat(m[2]);
            const rest = trimmed.substring(m[0].length).trim();
            
            let row = '';
            if (label) {
                row += chalk.dim(`${ljustCJK(label, maxLabelWidth)}: `);
            } else if (maxLabelWidth > 0) {
                row += ' '.repeat(maxLabelWidth + 2);
            }
            
            row += renderBar(pct / 100, 4);
            if (rest) {
                row += chalk.dim(`  ${rest}`);
            }
            lines.push(row);
        } else {
            lines.push(trimmed);
        }
    }

    if (info.reset_time && info.reset_time !== '—') {
        lines.push(`${chalk.cyan('↻')} ${chalk.dim(info.reset_time)}`);
    }

    // Add dashboard URL at bottom
    // lines.push(chalk.dim('─'.repeat(72))); // separator?
    // lines.push(chalk.dim(info.dashboard_url));

    // Wrap in boxen
    return boxen(lines.join('\n'), {
        title: chalk.bold(info.name),
        titleAlignment: 'center',
        padding: { top: 0, bottom: 0, left: 1, right: 1 },
        borderStyle: 'round',
        borderColor: info.error ? 'yellow' : 'green',
        width: 76,
        // Hack: put dashboard URL in titleBottom if supported, or just ignore for now
    }) + `\n${chalk.dim(info.dashboard_url.padStart(76/2 + info.dashboard_url.length/2))}`; 
    // Manual centering of URL below box? Or just let it be.
}

async function run() {
    const config = loadConfig(options.configDir);
    
    const selectedProviders = options.provider;
    const keys = selectedProviders && selectedProviders.length > 0 
        ? selectedProviders 
        : Object.keys(PROVIDERS);

    // Initial render (shows old data or loading)
    render();

    // Trigger all updates in parallel
    const promises = keys.map((key: string) => updateProvider(key, config));
    
    // Wait for this round to finish (useful for --once)
    await Promise.all(promises);
}

// Main loop
if (options.once) {
    await run();
} else {
    // Initial run
    await run();
    
    const interval = (options.interval || 60) * 1000;
    setInterval(() => {
        run().catch(console.error);
    }, interval);
}
