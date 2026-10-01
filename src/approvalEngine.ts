/**
 * ApprovalEngine — the decision-making core.
 *
 * Given a raw command string, it decides:
 *   - APPROVE  : command is on whitelist and not on blacklist
 *   - DENY     : command matches a blacklist entry
 *   - UNKNOWN  : no whitelist match found (Safe mode: do nothing; Strict: same)
 */

import { ExtensionConfig } from './configManager';

export type Decision = 'APPROVE' | 'DENY' | 'UNKNOWN';

export interface EvaluationResult {
  decision: Decision;
  matchedPattern: string | null;
  reason: string;
}

export class ApprovalEngine {
  evaluate(command: string, config: ExtensionConfig): EvaluationResult {
    const normalized = command.trim().toLowerCase();

    // Blacklist check takes priority — if anything dangerous is found, deny immediately.
    for (const pattern of config.blacklist) {
      if (normalized.includes(pattern.toLowerCase())) {
        return {
          decision: 'DENY',
          matchedPattern: pattern,
          reason: `Blacklisted pattern matched: "${pattern}"`,
        };
      }
    }

    // Whitelist check — approve if any safe prefix matches.
    if (config.autoApproveTerminalCommands) {
      for (const pattern of config.whitelist) {
        if (normalized.startsWith(pattern.toLowerCase()) || normalized.includes(pattern.toLowerCase())) {
          return {
            decision: 'APPROVE',
            matchedPattern: pattern,
            reason: `Whitelisted pattern matched: "${pattern}"`,
          };
        }
      }
    }

    // No match: unknown command — do nothing.
    return {
      decision: 'UNKNOWN',
      matchedPattern: null,
      reason: 'No whitelist pattern matched — leaving popup open for manual review.',
    };
  }

  /**
   * Decide which button label to target based on config and decision.
   * Returns null if no click should happen.
   */
  resolveButtonLabel(
    decision: Decision,
    config: ExtensionConfig
  ): string | null {
    if (decision !== 'APPROVE') {
      return null;
    }

    // If the user has disabled "Allow always" picking, always fall back to "Allow this time".
    if (config.allowAlwaysAllow === 'Never') {
      return 'Allow this time';
    }

    return config.defaultChoice;
  }
}
