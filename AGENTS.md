# AGENTS.md

AI Subscription Monitor - A TypeScript CLI tool to monitor AI service usage (OpenAI, Gemini, Claude, Cursor).

## Build, Lint, and Test Commands

### Build & Run

```bash
# Install dependencies
npm install

# Build TypeScript to dist/
npm run build

# Run in development mode (uses tsx)
npm run dev
# or
npm start

# Run compiled version
node dist/index.js
```

### Testing

**No test framework configured.** Add tests using your preferred framework (Jest, Vitest, etc.).

To run a single test file once added:
```bash
# Example with Jest
npx jest src/path/to/test.ts

# Example with Vitest
npx vitest run src/path/to/test.ts
```

### Linting

**No linter configured.** Consider adding ESLint:
```bash
npm install -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin
npx eslint --init
```

## Code Style Guidelines

### TypeScript

**Imports:**
- Use ES modules (`"type": "module"` in package.json)
- Import order: built-in modules → external deps → internal modules
- Use `.js` extension in imports (NodeNext module resolution)

```typescript
import fs from 'fs';
import axios from 'axios';
import { ProviderBase } from './base.js';
```

**Naming Conventions:**
- Classes: `PascalCase` (e.g., `OpenAIProvider`)
- Interfaces/Types: `PascalCase` (e.g., `SubscriptionInfo`)
- Variables/functions: `camelCase` (e.g., `fetchUsage`)
- Constants: `UPPER_SNAKE_CASE` for true constants
- Private/protected: prefix with `_` (optional)

**Formatting:**
- Indent: 4 spaces
- Semicolons: required
- Quotes: single quotes preferred
- Line length: ~100-120 chars
- Trailing commas in multi-line objects/arrays

**Types:**
- Always use explicit return types on public methods
- Prefer `interface` over `type` for object shapes
- Use strict TypeScript (`strict: true` in tsconfig)
- Avoid `any`; use `unknown` with type guards

```typescript
export interface SubscriptionInfo {
    name: string;
    usage_text: string;
}

async function fetchUsage(token: string): Promise<SubscriptionInfo> {
    // implementation
}
```

**Error Handling:**
- Use try/catch for async operations
- Return `{ data, isAuthError }` pattern for API calls
- Log errors to stderr, don't throw in providers
- Use `console.warn` for non-fatal issues

```typescript
try {
    const resp = await axios.get(url, { timeout: 10000 });
    return { data: resp.data, isAuthError: false };
} catch (e: any) {
    if (e.response?.status === 401) {
        return { data: null, isAuthError: true };
    }
    return { data: null, isAuthError: false };
}
```

### Project Structure

```
src/
├── index.ts           # CLI entry point
├── config.ts          # Config loading (YAML)
├── cli_runner.ts      # CLI status detection
├── utils.ts           # Utilities (exec, render, JWT)
├── keychain_cache.ts  # macOS Keychain access
└── providers/
    ├── base.ts        # Abstract base class
    ├── openai.ts      # OpenAI/Codex provider
    ├── gemini.ts      # Google Gemini provider
    ├── anthropic.ts   # Claude provider
    └── cursor.ts      # Cursor provider
```

### Provider Pattern

All providers extend `ProviderBase`:

```typescript
export class MyProvider extends ProviderBase {
    name = "Provider Name";
    dashboard_url = "https://...";
    cli_name = "cli-command";

    async fetch(): Promise<SubscriptionInfo> {
        // Fetch logic
        return {
            name: this.name,
            usage_text: "...",
            reset_time: "...",
            limit_note: "...",
            dashboard_url: this.dashboard_url,
            error: undefined
        };
    }
}
```

### Key Principles

1. **XDG Compliance**: Store configs in `~/.config/ai_subscription_monitor/`
2. **Credential Security**: Use macOS Keychain for tokens, never hardcode
3. **Graceful Degradation**: Continue working if one provider fails
4. **Timeouts**: Always set HTTP timeouts (10s default)
5. **Caching**: Cache keychain reads to `/tmp/` with TTL

### Environment Variables

```bash
GEMINI_CLIENT_ID=     # OAuth client ID
GEMINI_CLIENT_SECRET= # OAuth client secret
```

### Adding a New Provider

1. Create `src/providers/newprovider.ts`
2. Extend `ProviderBase`
3. Implement `fetch()` method
4. Add to `PROVIDERS` map in `index.ts`
5. Update CLI help text

## Agent Instructions

1. **Before editing**: Read the provider file you're modifying
2. **Test changes**: Run `npm run dev` to verify
3. **Build before commit**: Run `npm run build`
4. **No secrets**: Use environment variables or Keychain
5. **Error handling**: Don't let one provider crash the dashboard
