# Safe Auto Approve

**Safety-first auto-approval for AI Agent.**

Automatically clicks *"Allow this time"* when the agent asks permission to run commands that are on your whitelist. Silently ignores commands that match the blacklist or are unknown, leaving the popup open for your manual review.

---

## How It Works

```
AI Agent popup detected
        │
        ▼
  Read command text
        │
        ▼
  Blacklist check ─── match → DENY (do nothing, leave popup open)
        │
     no match
        │
        ▼
  Whitelist check ─── match → APPROVE → click "Allow this time"
        │
     no match
        │
        ▼
       UNKNOWN (do nothing, leave popup open)
```

File-change diff proposals ("Accept All") are handled on a separate loop, toggled by `autoAcceptChanges`.

---

## Requirements

### CDP Connection (critical)

Antigravity must be launched with the remote-debugging flag so the extension can reach its webview:

```sh
# Windows — add to your shortcut / launcher
antigravity.exe --remote-debugging-port=9229

# Or set the environment variable to use a different port
set ANTIGRAVITY_CDP_PORT=9229
```

If the port is not open, the extension logs a warning and shows a notification on startup. Everything else (settings, status bar, commands) still works.

---

## Settings

All settings live under `antigravityAutoApprove.*` and are editable via **File > Preferences > Settings**.

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `enabled` | boolean | `true` | Master switch |
| `mode` | `Safe` / `Strict` | `Safe` | Approval strategy |
| `defaultChoice` | `Allow this time` / `Allow always` | `Allow this time` | Button to click |
| `autoAcceptChanges` | boolean | `true` | Click "Accept All" on file changes |
| `autoApproveTerminalCommands` | boolean | `true` | Approve terminal commands from whitelist |
| `allowAlwaysAllow` | `Never` / `Whitelist Only` / `Always` | `Never` | Whether the permanent option can be chosen |
| `whitelist` | string[] | (see below) | Safe command prefixes |
| `blacklist` | string[] | (see below) | Dangerous patterns — never approved |
| `pollingIntervalMs` | number | `500` | DOM polling frequency (100–5000 ms) |
| `debugLogging` | boolean | `false` | Verbose output channel logging |

### Default Whitelist

`php artisan`, `composer`, `npm`, `npx`, `yarn`, `pnpm`, `git`, `vendor/bin/pint`, `node`, `python`, `pip`, `cargo`, `go run`, `go build`, `make`, `dotnet`, `mvn`, `gradle`

### Default Blacklist

`rm -rf`, `format`, `diskpart`, `reg delete`, `reg add`, `powershell`, `del /f`, `rd /s`, `rmdir /s`, `mkfs`, `dd if=`, `chmod 777`, `sudo rm`, `curl | bash`, `wget | bash`, `bash <(`, `sh <(`

---

## Commands (Command Palette)

| Command | Description |
|---------|-------------|
| `Antigravity Auto Approve: Enable` | Turn the extension on |
| `Antigravity Auto Approve: Disable` | Turn the extension off |
| `Antigravity Auto Approve: Show Status` | Log full config + CDP status |
| `Antigravity Auto Approve: Edit Whitelist` | Open Settings at the whitelist field |
| `Antigravity Auto Approve: Edit Blacklist` | Open Settings at the blacklist field |

---

## Development

```sh
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch mode (recompiles on save)
npm run watch

# Run engine unit tests (after compile)
node out/test/approvalEngine.test.js
```

Press **F5** in VS Code to open a new Extension Development Host window with the extension loaded.

---

## Architecture

```
src/
  extension.ts        — activation, command registration, wiring
  configManager.ts    — reads / reacts to VS Code settings
  approvalEngine.ts   — whitelist / blacklist decision logic
  cdpConnector.ts     — CDP HTTP + WebSocket helpers
  domWatcher.ts       — polling loop, DOM queries, button clicks
  statusBarManager.ts — status bar indicator
  logger.ts           — output channel wrapper
  test/
    approvalEngine.test.ts — unit tests for the decision engine
```

### Tuning DOM Selectors

The DOM selectors used to detect dialogs and buttons are defined as constants at the top of `domWatcher.ts`. After launching with CDP enabled, open DevTools on the agent webview, inspect the approval dialog, and update the selectors to match the live DOM.

---

## Safety Guarantees

1. **Blacklist always wins.** A command matching any blacklist pattern is never approved, even if it also matches the whitelist.
2. **Default to "Allow this time".** The extension never clicks "Always allow" unless you explicitly set `allowAlwaysAllow` to something other than `Never`.
3. **Unknown commands are ignored.** If a command matches neither list, the popup stays open for your manual decision.
4. **No file writes.** The extension only reads your settings and the DOM. It never modifies files on disk.

---

## License

MIT — Ananda Ibrahim
