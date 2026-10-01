/**
 * CdpConnector — connects to the Electron/Chrome DevTools Protocol endpoint
 * that Antigravity (VS Code fork) exposes, and provides helpers to:
 *   - enumerate targets (webviews, pages)
 *   - evaluate JS expressions inside a specific target
 *   - click DOM elements by selector
 *   - find and click buttons by text content
 *
 * The remote-debugging port is read from the ANTIGRAVITY_CDP_PORT env var,
 * falling back to 9229 (Electron default).
 *
 * NOTE: CDP access is only possible when VS Code / Antigravity is launched
 * with --remote-debugging-port=<PORT>.  This connector documents that
 * requirement clearly so the user knows what to do if the connection fails.
 */

import * as http from 'http';
import * as net from 'net';
import WebSocket from 'ws';
import { Logger } from './logger';

export interface CdpTarget {
  id: string;
  title: string;
  type: string;
  webSocketDebuggerUrl?: string;
  url: string;
}

export class CdpConnector {
  private port: number;
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
    this.port = parseInt(process.env['ANTIGRAVITY_CDP_PORT'] ?? '9229', 10);
  }

  getPort(): number {
    return this.port;
  }

  /**
   * Returns true if the CDP endpoint is reachable on the configured port.
   */
  async isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(1000);
      socket
        .once('connect', () => {
          socket.destroy();
          resolve(true);
        })
        .once('error', () => {
          socket.destroy();
          resolve(false);
        })
        .once('timeout', () => {
          socket.destroy();
          resolve(false);
        })
        .connect(this.port, '127.0.0.1');
    });
  }

  /**
   * Fetches the list of inspectable targets from the CDP /json endpoint.
   */
  async listTargets(): Promise<CdpTarget[]> {
    return new Promise((resolve, reject) => {
      http
        .get(`http://127.0.0.1:${this.port}/json`, (res) => {
          let body = '';
          res.on('data', (chunk: Buffer) => (body += chunk.toString()));
          res.on('end', () => {
            try {
              resolve(JSON.parse(body) as CdpTarget[]);
            } catch {
              reject(new Error('Failed to parse CDP /json response'));
            }
          });
        })
        .on('error', (err) => reject(err));
    });
  }

  /**
   * Finds all inspectable targets (workbench pages or webviews) for Antigravity.
   * In Antigravity IDE (VS Code fork), the main renderer windows are type 'page'
   * running workbench.html, where chat and diff widgets reside.
   */
  async findAgentTargets(): Promise<CdpTarget[]> {
    const all = await this.listTargets();
    return all.filter(
      (t) =>
        (t.type === 'page' || t.type === 'webview') &&
        (t.url.includes('workbench.html') ||
          t.title.toLowerCase().includes('antigravity') ||
          t.url.includes('agent') ||
          t.url.includes('vscode-file:'))
    );
  }

  async findAgentWebviews(): Promise<CdpTarget[]> {
    return this.findAgentTargets();
  }

  /**
   * Opens a WebSocket connection to a target and evaluates an expression.
   * Returns the result value.
   */
  async evaluate(wsUrl: string, expression: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      let id = 1;
      const msgId = id++;

      ws.once('open', () => {
        ws.send(
          JSON.stringify({
            id: msgId,
            method: 'Runtime.evaluate',
            params: {
              expression,
              returnByValue: true,
              awaitPromise: true,
            },
          })
        );
      });

      ws.on('message', (data: WebSocket.RawData) => {
        try {
          const msg = JSON.parse(data.toString()) as {
            id?: number;
            result?: { result?: { value?: unknown } };
            error?: { message: string };
          };
          if (msg.id === msgId) {
            ws.close();
            if (msg.error) {
              reject(new Error(msg.error.message));
            } else {
              resolve(msg.result?.result?.value ?? null);
            }
          }
        } catch {
          // ignore parse errors from other CDP messages
        }
      });

      ws.once('error', (err: Error) => {
        ws.close();
        reject(err);
      });

      // Safety timeout so we never hang.
      setTimeout(() => {
        ws.close();
        reject(new Error('CDP evaluate timed out after 5s'));
      }, 5000);
    });
  }

  /**
   * Tries to click a DOM element matching `selector` inside the target
   * identified by `wsUrl`.  Returns true if an element was found and clicked.
   */
  async clickElement(wsUrl: string, selector: string): Promise<boolean> {
    const script = `
      (function() {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (el) { el.click(); return true; }
        return false;
      })()
    `;
    const result = await this.evaluate(wsUrl, script);
    return result === true;
  }

  /**
   * Extracts all visible text from an element matching `selector`.
   * Returns null if the element is not found.
   */
  async getElementText(wsUrl: string, selector: string): Promise<string | null> {
    const script = `
      (function() {
        const el = document.querySelector(${JSON.stringify(selector)});
        return el ? el.innerText || el.textContent : null;
      })()
    `;
    const result = await this.evaluate(wsUrl, script);
    return typeof result === 'string' ? result : null;
  }
}
