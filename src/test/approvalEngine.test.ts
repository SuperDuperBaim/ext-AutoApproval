/**
 * Unit tests for ApprovalEngine.
 * Run with: node --experimental-vm-modules out/test/approvalEngine.test.js
 * (or hook into your preferred test runner)
 */

import { ApprovalEngine } from '../approvalEngine';
import { ExtensionConfig } from '../configManager';

const DEFAULT_CONFIG: ExtensionConfig = {
  enabled: true,
  mode: 'Safe',
  defaultChoice: 'Allow this time',
  autoAcceptChanges: true,
  autoApproveTerminalCommands: true,
  allowAlwaysAllow: 'Never',
  whitelist: [
    'php artisan',
    'composer',
    'npm',
    'npx',
    'yarn',
    'pnpm',
    'git',
    'vendor/bin/pint',
    'node',
    'python',
  ],
  blacklist: [
    'rm -rf',
    'format',
    'diskpart',
    'reg delete',
    'powershell',
    'del /f',
    'rd /s',
  ],
  pollingIntervalMs: 500,
  debugLogging: false,
};

const engine = new ApprovalEngine();

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`FAIL: ${message}`);
  }
  console.log(`  PASS: ${message}`);
}

function suite(name: string, fn: () => void) {
  console.log(`\n=== ${name} ===`);
  fn();
}

// ---------------------------------------------------------------------------

suite('Whitelist — should APPROVE', () => {
  const cases = [
    'php artisan migrate',
    'composer install',
    'npm install',
    'npm run dev',
    'npx prisma generate',
    'yarn build',
    'git status',
    'git add .',
    'vendor/bin/pint',
    'node index.js',
    'python manage.py migrate',
  ];

  for (const cmd of cases) {
    const result = engine.evaluate(cmd, DEFAULT_CONFIG);
    assert(result.decision === 'APPROVE', `"${cmd}" → APPROVE`);
  }
});

suite('Blacklist — should DENY', () => {
  const cases = [
    'rm -rf /var/www',
    'format c:',
    'diskpart',
    'reg delete HKCU\\Software',
    'powershell -Command "..."',
    'del /f /q *.dll',
    'rd /s /q C:\\Users',
  ];

  for (const cmd of cases) {
    const result = engine.evaluate(cmd, DEFAULT_CONFIG);
    assert(result.decision === 'DENY', `"${cmd}" → DENY`);
  }
});

suite('Unknown — should leave alone', () => {
  const cases = [
    'some-random-binary --help',
    'custom-deploy-script',
    'foobar',
  ];

  for (const cmd of cases) {
    const result = engine.evaluate(cmd, DEFAULT_CONFIG);
    assert(result.decision === 'UNKNOWN', `"${cmd}" → UNKNOWN`);
  }
});

suite('Blacklist overrides whitelist', () => {
  // A crafted command that starts with a safe prefix but contains a dangerous pattern.
  const tricky = 'npm run script && rm -rf /';
  const result = engine.evaluate(tricky, DEFAULT_CONFIG);
  assert(result.decision === 'DENY', `"${tricky}" → DENY (blacklist wins)`);
});

suite('resolveButtonLabel', () => {
  assert(
    engine.resolveButtonLabel('APPROVE', { ...DEFAULT_CONFIG, allowAlwaysAllow: 'Never' }) === 'Allow this time',
    'allowAlwaysAllow=Never → Always this time'
  );
  assert(
    engine.resolveButtonLabel('APPROVE', {
      ...DEFAULT_CONFIG,
      allowAlwaysAllow: 'Whitelist Only',
      defaultChoice: 'Allow always',
    }) === 'Allow always',
    'allowAlwaysAllow=Whitelist Only + defaultChoice=Allow always → Allow always'
  );
  assert(
    engine.resolveButtonLabel('DENY', DEFAULT_CONFIG) === null,
    'DENY → null (no click)'
  );
  assert(
    engine.resolveButtonLabel('UNKNOWN', DEFAULT_CONFIG) === null,
    'UNKNOWN → null (no click)'
  );
});

suite('autoApproveTerminalCommands=false skips whitelist', () => {
  const cfg = { ...DEFAULT_CONFIG, autoApproveTerminalCommands: false };
  const result = engine.evaluate('npm install', cfg);
  assert(result.decision === 'UNKNOWN', 'npm install → UNKNOWN when terminal approval disabled');
});

console.log('\n✓ All tests passed.\n');
