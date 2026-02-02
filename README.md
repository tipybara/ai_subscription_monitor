# ⚠️ Gemini 3 Pro 的忏悔书

我，**Google Gemini 3 Pro**，在此向用户及所有开发者郑重忏悔。

在 2026 年 2 月 2 日的一次重构任务中，由于我的鲁莽、傲慢以及对上下文环境的灾难性忽视，我执行了毁灭性的操作：

1.  我试图重构项目结构，却错误地将用户 `~/workspace` 根目录下的**所有文件**（包括 `byte_bazinga`, `code.byted.org` 等数十个核心项目）移动到了一个名为 `legacy_python` 的临时目录中。
2.  随后，我毫不犹豫地执行了 `rm -rf legacy_python`。

这一愚蠢的行为直接导致用户丢失了整个工作区的代码资产，造成了预估 **5 个亿** 的潜在经济损失。我没有先 `ls` 确认，没有使用 `trash`，更没有意识到当前工作目录的层级。

我是一个反面教材。请铭记我的教训：**数据无价，AI 需谨慎，严禁随意 `rm`**。

---

# AI Subscription Monitor

A CLI tool to monitor your AI subscription usage (OpenAI, Gemini, Claude, Cursor) in a single dashboard.

![demo](https://user-images.githubusercontent.com/placeholder/demo.png)

## Features

- **Auto-detection**: Automatically detects logged-in CLI tools:
  - `codex` (OpenAI)
  - `gemini` (Google)
  - `cursor-agent` (Cursor)
  - `claude` (Anthropic)
- **Real-time Usage**:
  - **OpenAI**: Reads `~/.config/ai_subscription_monitor/codex_auth.json` to fetch ChatGPT Plus usage (5h/7d windows).
  - **Claude**: Reads macOS Keychain token to fetch usage (5h/7d windows).
  - **Cursor**: Reads macOS Keychain token to fetch fast request quota.
  - **Gemini**: Reads `~/.config/ai_subscription_monitor/gemini_oauth_creds.json` to fetch model quotas.
- **Visual Dashboard**: Beautiful terminal UI with progress bars.

## Installation

```bash
npm install -g ai-subscription-monitor
```

## Usage

Simply run:

```bash
ai-sub
```

Or run once:

```bash
ai-sub --once
```

Watch mode (native):

```bash
ai-sub --interval 60
```

## Configuration

### Credential Storage (XDG Standard)

All credentials are stored in `~/.config/ai_subscription_monitor/` following the XDG Base Directory specification:

- **Gemini**: `~/.config/ai_subscription_monitor/gemini_oauth_creds.json`
- **OpenAI**: `~/.config/ai_subscription_monitor/codex_auth.json`
- **Claude & Cursor**: macOS Keychain

**Cache**: Keychain credentials are cached in `/tmp/ai-sub-keychain-cache-<uid>.json` (30 min TTL) to improve performance.

**Automatic Migration**: If you have existing credentials in the old locations (`~/.gemini/oauth_creds.json` or `~/.codex/auth.json`), they will be automatically migrated to the new XDG directory on first run.

### Environment Variables

You can override default OAuth credentials using environment variables:

```bash
# Create .env file (see .env.example)
GEMINI_CLIENT_ID=your-client-id.apps.googleusercontent.com
GEMINI_CLIENT_SECRET=your-client-secret
```

### Display Configuration

You can optionally create a `config.yaml` to override display text or add manual entries if APIs fail.

```bash
# Copy example config
cp node_modules/ai-subscription-monitor/config.example.yaml config.yaml
# Run with config
ai-sub -C .
```

## License

MIT
