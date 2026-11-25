import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MenuItemConstructorOptions } from 'electron';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  addTroubleshootingMenu,
  bootstrapFailureDialog,
  bootstrapFailureActions,
  diagnosticsReport,
  downloadTauPage,
  troubleshootingMenuLabel,
} from '#main/troubleshooting-menu.js';
import type { DiagnosticsSummary } from '#main/troubleshooting-menu.js';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const summary: DiagnosticsSummary = {
  version: '1.14.20',
  channel: 'production',
  platform: 'darwin',
  arch: 'arm64',
  packaged: true,
  electron: '39.0.0',
  grantedFolders: 3,
};

type FakeItem = Readonly<{ label?: string; role?: string; type?: string; submenu?: unknown }>;
type FakeSubmenu = { readonly items: FakeItem[]; append: (item: FakeItem) => void };
const fakeSubmenu = (items: FakeItem[] = []): FakeSubmenu => ({
  items,
  append(item) {
    items.push(item);
  },
});
const asItem = (options: MenuItemConstructorOptions): FakeItem => options;
const actions = () => ({
  restartInSafeMode: vi.fn(),
  showLogs: vi.fn(),
  copyDiagnostics: vi.fn(),
  checkForUpdates: vi.fn(),
});

describe('Help → Troubleshooting', () => {
  it('should add its four items under the Help menu, after a separator', () => {
    const submenu = fakeSubmenu([{ label: 'Learn More' }]);
    const help: FakeItem = { role: 'help', label: 'Help', submenu };
    const tau: FakeItem = { label: 'Tau' };
    const menu = { items: [tau, help], append: vi.fn() };
    const handlers = actions();
    expect(addTroubleshootingMenu(menu, asItem, handlers)).toBe(true);
    const added = submenu.items.slice(1);
    expect(added[0]).toMatchObject({ type: 'separator' });
    expect(added[1]?.label).toBe(troubleshootingMenuLabel);
    const entries = added[1]!.submenu as MenuItemConstructorOptions[];
    expect(entries.map((entry) => entry.label)).toEqual([
      'Restart in Safe Mode',
      'Show Logs',
      'Copy Diagnostics',
      'Check for Updates…',
    ]);
    for (const entry of entries) {
      (entry.click as (() => void) | undefined)?.();
    }
    expect(handlers.restartInSafeMode).toHaveBeenCalledOnce();
    expect(handlers.showLogs).toHaveBeenCalledOnce();
    expect(handlers.copyDiagnostics).toHaveBeenCalledOnce();
    expect(handlers.checkForUpdates).toHaveBeenCalledOnce();
    expect(menu.append).not.toHaveBeenCalled();
  });

  it('should add a Help menu when the application menu has none', () => {
    const file: FakeItem = { label: 'File' };
    const menu = { items: [file], append: vi.fn() };
    expect(addTroubleshootingMenu(menu, asItem, actions())).toBe(true);
    expect(menu.append).toHaveBeenCalledOnce();
    const help = menu.append.mock.calls[0]?.[0] as MenuItemConstructorOptions;
    expect(help.role).toBe('help');
    expect((help.submenu as MenuItemConstructorOptions[])[0]?.label).toBe(troubleshootingMenuLabel);
  });

  it('should report that nothing was installed when there is no application menu', () => {
    expect(addTroubleshootingMenu(undefined, asItem, actions())).toBe(false);
  });
});

describe('diagnosticsReport', () => {
  it('should carry the version and the last 500 log lines with no home directory path', () => {
    const directory = mkdtempSync(join(tmpdir(), 'tau-troubleshooting-'));
    directories.push(directory);
    const lines = Array.from(
      { length: 600 },
      (_, index) => `line ${String(index)} ${homedir()}/Library/Application Support/Tau/logs`,
    );
    writeFileSync(join(directory, 'desktop.log'), `${lines.join('\n')}\n`);
    const report = diagnosticsReport(summary, join(directory, 'desktop.log'), homedir());
    expect(report).toContain('1.14.20');
    expect(report).toContain('production');
    expect(report).toContain('line 599');
    expect(report).toContain('line 100');
    expect(report).not.toContain('line 99 ');
    expect(report).not.toContain(homedir());
    expect(report).toContain('~/Library/Application Support/Tau/logs');
  });

  it('should scrub another account’s home directory too', () => {
    const directory = mkdtempSync(join(tmpdir(), 'tau-troubleshooting-'));
    directories.push(directory);
    writeFileSync(join(directory, 'desktop.log'), 'opened /Users/someone/Projects and C:\\Users\\someone\\Tau\n');
    const report = diagnosticsReport(summary, join(directory, 'desktop.log'), '/home/tester');
    expect(report).not.toContain('someone');
  });

  it('should scrub the whole of a Windows account name that holds spaces', () => {
    const directory = mkdtempSync(join(tmpdir(), 'tau-troubleshooting-'));
    directories.push(directory);
    writeFileSync(
      join(directory, 'desktop.log'),
      'opened C:\\Users\\Jane Q Public\\Tau and C:/Users/Jane Q Public/AppData and \\Users\\Jane Q Public\\x\n',
    );
    const report = diagnosticsReport(summary, join(directory, 'desktop.log'), '/home/tester');
    expect(report).not.toMatch(/Jane|Public/u);
    expect(report).toContain(String.raw`opened ~\Tau and ~/AppData and ~\x`);
  });

  it('should still describe the build when the log cannot be read', () => {
    const report = diagnosticsReport(summary, join(tmpdir(), 'tau-no-such-log', 'desktop.log'), homedir());
    expect(report).toContain('1.14.20');
    expect(report).toContain('log unavailable');
  });
});

describe('bootstrapFailureDialog', () => {
  it('should name an unwritable data folder in plain words, with the four exits and Quit as cancel', () => {
    const dialog = bootstrapFailureDialog(Object.assign(new Error('EACCES: /x'), { code: 'EACCES' }), 'home-directory');
    expect(dialog.message).toBe('Tau can’t write to its data folder.');
    expect(dialog.buttons).toEqual(['Restart in Safe Mode', 'Show Logs', 'Download Tau', 'Quit']);
    expect(bootstrapFailureActions).toEqual(['restart-safe-mode', 'show-logs', 'download-tau', 'quit']);
    expect(dialog.cancelId).toBe(3);
    expect(dialog.detail).toContain('EACCES');
    expect(dialog.detail).not.toContain('/x');
  });

  it('should name a full disk', () => {
    expect(bootstrapFailureDialog(Object.assign(new Error('full'), { code: 'ENOSPC' }), 'window').message).toBe(
      'Your disk is full.',
    );
  });

  it('should fall back to a general message for any other failure', () => {
    expect(bootstrapFailureDialog(new Error('boom'), 'window').message).toBe('Tau couldn’t start.');
  });
});

describe('downloadTauPage', () => {
  it('should open the latest release for production and the release list for staging', () => {
    expect(downloadTauPage('production')).toBe('https://github.com/taucad/tau/releases/latest');
    expect(downloadTauPage('staging')).toBe('https://github.com/taucad/tau/releases');
  });
});
