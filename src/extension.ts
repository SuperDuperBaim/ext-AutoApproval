/**
 * extension.ts — entry point.
 *
 * Wires together ConfigManager, ApprovalEngine, CdpConnector, DomWatcher,
 * StatusBarManager, and the five command contributions.
 */

import * as vscode from 'vscode';
import { ConfigManager } from './configManager';
import { ApprovalEngine } from './approvalEngine';
import { CdpConnector } from './cdpConnector';
import { DomWatcher } from './domWatcher';
import { StatusBarManager } from './statusBarManager';
import { Logger } from './logger';

export function activate(context: vscode.ExtensionContext) {
  const logger = new Logger('Safe Auto Approve');
  const configMgr = new ConfigManager();
  const engine = new ApprovalEngine();
  const cdp = new CdpConnector(logger);
  const watcher = new DomWatcher(logger, cdp, engine);
  const statusBar = new StatusBarManager();

  // Load initial config and start watching.
  const initialConfig = configMgr.get();
  logger.setDebug(initialConfig.debugLogging);
  statusBar.update(initialConfig);

  if (initialConfig.enabled) {
    watcher.start(initialConfig);
    logger.info(
      `Safe Auto Approve activated (mode: ${initialConfig.mode}, CDP port: ${cdp.getPort()})`
    );
    checkCdpAvailability(cdp, logger);
  }

  // React to settings changes.
  configMgr.onDidChange((cfg) => {
    logger.setDebug(cfg.debugLogging);
    statusBar.update(cfg);

    if (cfg.enabled) {
      watcher.start(cfg);
      logger.info(`Config updated — watcher restarted (mode: ${cfg.mode})`);
    } else {
      watcher.stop();
      logger.info('Extension disabled via settings — watcher stopped.');
    }
  });

  // ── Commands ────────────────────────────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand('antigravityAutoApprove.enable', async () => {
      await vscode.workspace
        .getConfiguration('antigravityAutoApprove')
        .update('enabled', true, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage('Safe Auto Approve: Enabled');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('antigravityAutoApprove.disable', async () => {
      await vscode.workspace
        .getConfiguration('antigravityAutoApprove')
        .update('enabled', false, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage('Safe Auto Approve: Disabled');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('antigravityAutoApprove.showStatus', async () => {
      const cfg = configMgr.get();
      const available = await cdp.isAvailable();
      const lines = [
        `Enabled     : ${cfg.enabled}`,
        `Mode        : ${cfg.mode}`,
        `Default btn : ${cfg.defaultChoice}`,
        `Accept All  : ${cfg.autoAcceptChanges}`,
        `Term. cmds  : ${cfg.autoApproveTerminalCommands}`,
        `Always allow: ${cfg.allowAlwaysAllow}`,
        `Polling (ms): ${cfg.pollingIntervalMs}`,
        `CDP port    : ${cdp.getPort()}`,
        `CDP reachable: ${available ? 'YES' : 'NO — launch IDE with --remote-debugging-port=PORT'}`,
        `Whitelist   : ${cfg.whitelist.join(', ')}`,
        `Blacklist   : ${cfg.blacklist.join(', ')}`,
      ];
      logger.show();
      logger.info('=== Status ===\n' + lines.join('\n'));
      vscode.window.showInformationMessage(
        `Auto Approve: ${cfg.enabled ? cfg.mode : 'OFF'} | CDP: ${available ? 'connected' : 'not found'}`
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('antigravityAutoApprove.editWhitelist', async () => {
      await vscode.commands.executeCommand(
        'workbench.action.openSettings',
        'antigravityAutoApprove.whitelist'
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('antigravityAutoApprove.editBlacklist', async () => {
      await vscode.commands.executeCommand(
        'workbench.action.openSettings',
        'antigravityAutoApprove.blacklist'
      );
    })
  );

  // ── Cleanup ─────────────────────────────────────────────────────────────

  context.subscriptions.push({
    dispose: () => {
      watcher.stop();
      configMgr.dispose();
      statusBar.dispose();
      logger.dispose();
    },
  });
}

export function deactivate() {
  // All cleanup is handled via context.subscriptions.
}

// ---------------------------------------------------------------------------

async function checkCdpAvailability(cdp: CdpConnector, logger: Logger) {
  const available = await cdp.isAvailable();
  if (!available) {
    const msg =
      `Safe Auto Approve: CDP endpoint not found on port ${cdp.getPort()}. ` +
      `Launch Antigravity with --remote-debugging-port=${cdp.getPort()} (or set ANTIGRAVITY_CDP_PORT env var).`;
    logger.warn(msg);
    const action = await vscode.window.showWarningMessage(msg, 'Show Output', 'Dismiss');
    if (action === 'Show Output') {
      logger.show();
    }
  } else {
    logger.info(`CDP connected on port ${cdp.getPort()}.`);
    const targets = await cdp.findAgentWebviews().catch(() => []);
    logger.info(`Agent webview targets found: ${targets.length}`);
  }
}
