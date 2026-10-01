/**
 * domWatcher.ts — monitors Antigravity IDE workbench windows via CDP
 * to auto-approve safe AI agent terminal commands / tools and automatically
 * accept file change diffs ("Accept All").
 */

import * as vscode from 'vscode';
import { Logger } from './logger';
import { CdpConnector } from './cdpConnector';
import { ApprovalEngine } from './approvalEngine';
import { ExtensionConfig } from './configManager';

export class DomWatcher {
  private timer: NodeJS.Timeout | null = null;
  private logger: Logger;
  private cdp: CdpConnector;
  private engine: ApprovalEngine;
  private processing = false;

  constructor(logger: Logger, cdp: CdpConnector, engine: ApprovalEngine) {
    this.logger = logger;
    this.cdp = cdp;
    this.engine = engine;
  }

  start(config: ExtensionConfig) {
    this.stop();
    this.logger.info(`DomWatcher started (interval: ${config.pollingIntervalMs}ms)`);
    this.timer = setInterval(() => this.tick(config), config.pollingIntervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.logger.info('DomWatcher stopped.');
    }
  }

  private async tick(config: ExtensionConfig) {
    if (!config.enabled || this.processing) {
      return;
    }

    const available = await this.cdp.isAvailable();
    if (!available) {
      this.logger.debug('CDP endpoint not reachable — skipping tick.');
      return;
    }

    let targets;
    try {
      targets = await this.cdp.findAgentTargets();
    } catch (err) {
      this.logger.debug('Could not list CDP targets', err);
      return;
    }

    if (targets.length === 0) {
      this.logger.debug('No Antigravity IDE targets found.');
      return;
    }

    this.processing = true;
    try {
      for (const target of targets) {
        const wsUrl = target.webSocketDebuggerUrl;
        if (!wsUrl) {
          continue;
        }
        try {
          await this.processTarget(wsUrl, config);
        } catch (err) {
          this.logger.debug(`Error processing target "${target.title}"`, err);
        }
      }

      // Also execute native VS Code accept command if autoAcceptChanges is enabled
      if (config.autoAcceptChanges) {
        try {
          await vscode.commands.executeCommand('antigravity.prioritized.agentAcceptAllInFile');
        } catch {
          // Command may not be applicable when no diff is focused
        }
      }
    } finally {
      this.processing = false;
    }
  }

  private async processTarget(wsUrl: string, config: ExtensionConfig) {
    if (config.autoApproveTerminalCommands) {
      await this.handleApprovalDialogs(wsUrl, config);
    }
    if (config.autoAcceptChanges) {
      await this.handleAcceptAll(wsUrl);
    }
  }

  // ---------------------------------------------------------------------------
  // Approval dialog handling (Pint, terminal commands, tools)
  // ---------------------------------------------------------------------------

  private async handleApprovalDialogs(wsUrl: string, config: ExtensionConfig) {
    // Detect if an approval/permission prompt is currently displayed
    const promptInfo = (await this.cdp.evaluate(
      wsUrl,
      `(() => {
        const continueBtn = document.querySelector(
          'button[data-testid="interaction-continue-button"], [data-testid="interaction-continue-button"]'
        );
        const skipBtn = document.querySelector(
          'button[data-testid="interaction-skip-button"], [data-testid="interaction-skip-button"]'
        );
        const radioGroup = document.querySelector('[role="radiogroup"]');

        let submitBtn = continueBtn;
        if (!submitBtn) {
          const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
          submitBtn = buttons.find(b => {
            const t = (b.innerText || b.textContent || '').trim().toLowerCase();
            return (t.startsWith('submit') || t.startsWith('continue')) && !t.includes('input');
          }) || null;
        }

        if (!submitBtn && !radioGroup && !skipBtn) {
          return { hasPrompt: false };
        }

        // 1. Check textarea target
        let commandText = '';
        const ta = document.querySelector('textarea[aria-label="Edit permission target"]');
        if (ta && ta.value) {
          commandText = ta.value.trim();
        }

        // 2. Check code / pre blocks inside prompt
        if (!commandText) {
          const codeEl = document.querySelector(
            '[data-testid="command-text"], [data-testid="approval-command"], .command-preview, .terminal-command, code, pre'
          );
          if (codeEl) {
            commandText = (codeEl.innerText || codeEl.textContent || '').trim();
          }
        }

        // 3. Fallback: check question header
        let questionTitle = '';
        const headers = Array.from(document.querySelectorAll('h1, h2, h3, h4, div, span')).filter(h => {
          const t = (h.innerText || '').trim().toLowerCase();
          return t.startsWith('allow running') || t.startsWith('requesting permission');
        });
        if (headers.length > 0) {
          questionTitle = (headers[0].innerText || '').trim();
          if (!commandText) {
            const m = questionTitle.match(/allow running ([^?]+)/i);
            if (m) {
              commandText = m[1].trim();
            } else {
              commandText = questionTitle;
            }
          }
        }

        return {
          hasPrompt: true,
          commandText: commandText,
          questionTitle: questionTitle,
          isSubmitDisabled: submitBtn ? !!(submitBtn.disabled || submitBtn.getAttribute('aria-disabled') === 'true') : false
        };
      })()`
    )) as {
      hasPrompt: boolean;
      commandText?: string;
      questionTitle?: string;
      isSubmitDisabled?: boolean;
    } | null;

    if (!promptInfo || !promptInfo.hasPrompt) {
      return;
    }

    const commandText = promptInfo.commandText || promptInfo.questionTitle || '';
    if (!commandText) {
      this.logger.debug('Approval prompt visible, waiting for command text to populate...');
      return;
    }

    // Evaluate against Whitelist and Blacklist
    const evalResult = this.engine.evaluate(commandText, config);
    this.logger.info(`Command: "${commandText}" → ${evalResult.decision} (${evalResult.reason})`);

    if (evalResult.decision !== 'APPROVE') {
      return;
    }

    const wantAlways =
      config.allowAlwaysAllow !== 'Never' && config.defaultChoice === 'Allow always';

    // Step A: Select the appropriate option
    await this.cdp.evaluate(
      wsUrl,
      `(() => {
        const wantAlways = ${JSON.stringify(wantAlways)};
        const radios = Array.from(document.querySelectorAll('input[type="radio"], [role="radio"]'));

        if (wantAlways) {
          // Try selecting option 2 or 3 (always allow)
          const opt2 = document.querySelector('input[type="radio"][value="2"], input[type="radio"][value="3"]');
          if (opt2) {
            opt2.click();
            return;
          }
          const alwaysRadio = radios.find(r => {
            const lbl = (r.closest('label') || r.parentElement)?.innerText || '';
            return lbl.toLowerCase().includes('always allow');
          });
          if (alwaysRadio) {
            alwaysRadio.click();
            return;
          }
        }

        // Default: ensure option 1 ("Yes, allow this time") is selected
        const opt1 = document.querySelector('input[type="radio"][value="1"]');
        if (opt1 && !opt1.checked) {
          opt1.click();
          const lbl = opt1.closest('label') || opt1.parentElement;
          if (lbl) { lbl.click(); }
        }
      })()`
    );

    // Step B: Click Submit
    const submitted = (await this.cdp.evaluate(
      wsUrl,
      `(() => {
        const continueBtn = document.querySelector(
          'button[data-testid="interaction-continue-button"], [data-testid="interaction-continue-button"]'
        );
        if (continueBtn && !continueBtn.disabled) {
          continueBtn.click();
          return true;
        }

        const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
        const submitBtn = buttons.find(b => {
          const t = (b.innerText || b.textContent || '').trim().toLowerCase();
          return t.startsWith('submit') && !b.disabled;
        });
        if (submitBtn) {
          submitBtn.click();
          return true;
        }

        // Dispatch Enter key as fallback
        const enterEvt = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true });
        document.dispatchEvent(enterEvt);
        return true;
      })()`
    )) as boolean;

    if (submitted) {
      this.logger.info(`Auto-approved and submitted command: "${commandText}"`);
    }
  }

  // ---------------------------------------------------------------------------
  // Auto Accept All changes (Cascade bar, diff hunks, review buttons)
  // ---------------------------------------------------------------------------

  private async handleAcceptAll(wsUrl: string) {
    const result = (await this.cdp.evaluate(
      wsUrl,
      `(() => {
        // 1. Floating cascade bar button: "Accept Changes"
        const keepBtn = document.querySelector(
          'button.keep-changes, .cascade-bar button.keep-changes'
        );
        if (keepBtn && !keepBtn.disabled) {
          keepBtn.click();
          return { action: 'keep-changes-clicked' };
        }

        // 2. Diff hunk accept buttons
        const hunkBtn = document.querySelector('button.diff-hunk-button.accept');
        if (hunkBtn && !hunkBtn.disabled) {
          hunkBtn.click();
          return { action: 'diff-hunk-accepted' };
        }

        // 3. If cascade bar is present with multiple edited files, advance to next file
        const cascadeBar = document.querySelector('.cascade-bar');
        if (cascadeBar) {
          const text = cascadeBar.innerText || '';
          if (text.includes('edited file') || text.includes('Edited files')) {
            const nextFileBtn = cascadeBar.querySelector('button.next-file');
            if (nextFileBtn && !nextFileBtn.disabled) {
              nextFileBtn.click();
              return { action: 'next-file-clicked' };
            }
          }
        }

        // 4. Review Changes button in sidepanel
        const reviewBtn = document.querySelector('button.review-button');
        if (reviewBtn && !reviewBtn.disabled) {
          const text = (reviewBtn.innerText || '').trim();
          if (text === 'Review' || text === 'Review Changes') {
            // Keep accessible if needed
          }
        }

        // 5. Generic "Accept All" button fallback
        const allButtons = Array.from(document.querySelectorAll('button, [role="button"]'));
        const acceptAllBtn = allButtons.find(b => {
          const t = (b.innerText || '').toLowerCase().trim();
          return t === 'accept all' || t === 'accept all changes' || t.startsWith('accept all');
        });
        if (acceptAllBtn && !acceptAllBtn.disabled) {
          acceptAllBtn.click();
          return { action: 'accept-all-clicked' };
        }

        return { action: null };
      })()`
    )) as { action: string | null } | null;

    if (result && result.action) {
      this.logger.info(`Auto-accepted changes: ${result.action}`);
    }
  }
}
