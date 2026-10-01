/**
 * StatusBarManager — shows a compact status indicator in the VS Code status bar.
 *
 * Displays:
 *   $(shield)  Auto Approve: ON   (green, Safe mode)
 *   $(shield)  Auto Approve: STRICT (yellow, Strict mode)
 *   $(shield-x) Auto Approve: OFF  (dimmed)
 *
 * Click opens the Settings UI filtered to this extension.
 */

import * as vscode from 'vscode';
import { ExtensionConfig } from './configManager';

export class StatusBarManager {
  private item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.item.command = 'workbench.action.openSettings';
    this.item.tooltip = 'Safe Auto Approve — click to open Settings';
    this.item.show();
  }

  update(config: ExtensionConfig) {
    if (!config.enabled) {
      this.item.text = '$(shield-x) Auto Approve: OFF';
      this.item.color = new vscode.ThemeColor('statusBarItem.warningForeground');
      this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      return;
    }

    const modeLabel = config.mode === 'Strict' ? 'STRICT' : 'ON';
    const icon = config.mode === 'Strict' ? '$(lock)' : '$(shield)';

    this.item.text = `${icon} Auto Approve: ${modeLabel}`;
    this.item.color = undefined;
    this.item.backgroundColor = undefined;
  }

  dispose() {
    this.item.dispose();
  }
}
