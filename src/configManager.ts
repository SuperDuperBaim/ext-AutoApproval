/**
 * ConfigManager — reads and reacts to VS Code settings for the extension.
 * Wraps the vscode.workspace.getConfiguration API so the rest of the code
 * never touches it directly.
 */

import * as vscode from 'vscode';

const SECTION = 'antigravityAutoApprove';

const DEFAULT_WHITELIST = [
  'php artisan',
  'composer',
  'npm',
  'npx',
  'yarn',
  'pnpm',
  'git',
  'vendor/bin/pint',
  'pint',
  'node',
  'python',
  'pip',
  'cargo',
  'go run',
  'go build',
  'make',
  'dotnet',
  'mvn',
  'gradle',
];

const DEFAULT_BLACKLIST = [
  'rm -rf',
  'format',
  'diskpart',
  'reg delete',
  'reg add',
  'powershell',
  'del /f',
  'rd /s',
  'rmdir /s',
  'mkfs',
  'dd if=',
  ':(){ :|:& };:',
  'chmod 777',
  'sudo rm',
  'curl | bash',
  'wget | bash',
  'bash <(',
  'sh <(',
];

export interface ExtensionConfig {
  enabled: boolean;
  mode: 'Safe' | 'Strict';
  defaultChoice: 'Allow this time' | 'Allow always';
  autoAcceptChanges: boolean;
  autoApproveTerminalCommands: boolean;
  allowAlwaysAllow: 'Never' | 'Whitelist Only' | 'Always';
  whitelist: string[];
  blacklist: string[];
  pollingIntervalMs: number;
  debugLogging: boolean;
}

export class ConfigManager {
  private _onDidChange = new vscode.EventEmitter<ExtensionConfig>();
  readonly onDidChange = this._onDidChange.event;

  private _disposable: vscode.Disposable;

  constructor() {
    this._disposable = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(SECTION)) {
        this._onDidChange.fire(this.get());
      }
    });
  }

  get(): ExtensionConfig {
    const cfg = vscode.workspace.getConfiguration(SECTION);
    const configuredWhitelist = cfg.get<string[]>('whitelist', DEFAULT_WHITELIST);
    const whitelist = configuredWhitelist && configuredWhitelist.length > 0 ? configuredWhitelist : DEFAULT_WHITELIST;

    const configuredBlacklist = cfg.get<string[]>('blacklist', DEFAULT_BLACKLIST);
    const blacklist = configuredBlacklist && configuredBlacklist.length > 0 ? configuredBlacklist : DEFAULT_BLACKLIST;

    return {
      enabled: cfg.get<boolean>('enabled', true),
      mode: cfg.get<'Safe' | 'Strict'>('mode', 'Safe'),
      defaultChoice: cfg.get<'Allow this time' | 'Allow always'>('defaultChoice', 'Allow this time'),
      autoAcceptChanges: cfg.get<boolean>('autoAcceptChanges', true),
      autoApproveTerminalCommands: cfg.get<boolean>('autoApproveTerminalCommands', true),
      allowAlwaysAllow: cfg.get<'Never' | 'Whitelist Only' | 'Always'>('allowAlwaysAllow', 'Never'),
      whitelist,
      blacklist,
      pollingIntervalMs: cfg.get<number>('pollingIntervalMs', 500),
      debugLogging: cfg.get<boolean>('debugLogging', false),
    };
  }

  dispose() {
    this._disposable.dispose();
    this._onDidChange.dispose();
  }
}
