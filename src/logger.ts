/**
 * Logger — thin wrapper around vscode.OutputChannel.
 * Provides debug/info/warn/error levels and a structured prefix.
 */

import * as vscode from 'vscode';

export class Logger {
  private channel: vscode.OutputChannel;
  private debugEnabled = false;

  constructor(channelName: string) {
    this.channel = vscode.window.createOutputChannel(channelName);
  }

  setDebug(enabled: boolean) {
    this.debugEnabled = enabled;
  }

  debug(message: string, ...args: unknown[]) {
    if (this.debugEnabled) {
      this.write('DEBUG', message, args);
    }
  }

  info(message: string, ...args: unknown[]) {
    this.write('INFO', message, args);
  }

  warn(message: string, ...args: unknown[]) {
    this.write('WARN', message, args);
  }

  error(message: string, ...args: unknown[]) {
    this.write('ERROR', message, args);
    vscode.window.showErrorMessage(`[Auto Approve] ${message}`);
  }

  show() {
    this.channel.show(true);
  }

  private write(level: string, message: string, args: unknown[]) {
    const ts = new Date().toISOString();
    const extra = args.length > 0 ? ' ' + args.map((a) => JSON.stringify(a)).join(' ') : '';
    this.channel.appendLine(`[${ts}] [${level}] ${message}${extra}`);
  }

  dispose() {
    this.channel.dispose();
  }
}
