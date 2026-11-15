/**
 * Sign-in conformance (ACP agent policy rule 10): every reviewed profile gets a
 * sign-in command a user can paste into their own terminal.
 *
 * Iterates `acpAgentProfiles`, so a new profile is covered with no edit here.
 * The advertised shapes are the ones the pinned adapters really send: Claude's
 * adapter 0.70.0 names its own process (`process.execPath` plus its module
 * path) as the `terminal-auth` command, which inside the desktop is Tau's
 * Electron helper and never works in the user's terminal (F1).
 */

import { win32 } from 'node:path';

import type { AuthMethod } from '@agentclientprotocol/sdk';
import { describe, expect, it } from 'vitest';

import { acpAgentProfiles } from '#acp/registry.js';
import type { AcpAdapter, AcpAgentProfile } from '#acp/registry.js';
import { loginOf } from '#acp/session.js';
import type { AcpLoginHost } from '#acp/session.js';

/** Where the packaged desktop keeps a module adapter: a path a shell would split. */
const modulePathOf = (profile: AcpAgentProfile): string =>
  `/Applications/Tau 4.app/Contents/Resources/app.asar/node_modules/${profile.package ?? profile.id}/dist/index.js`;

/** The Electron helper the desktop runs module adapters with. */
const helperPath = '/Applications/Tau 4.app/Contents/Frameworks/Tau Helper.app/Contents/MacOS/Tau Helper';

const posixHost: AcpLoginHost = { platform: 'darwin', execPath: process.execPath };

/** An adapter as resolution produces it, with a module path when the profile has a package. */
const adapterOf = (
  profile: AcpAgentProfile,
  extra: { readonly executablePath?: string; readonly executableSource?: 'path' | 'fallback' } = {},
): AcpAdapter & { readonly executableSource?: 'path' | 'fallback' } =>
  profile.package === undefined
    ? { ...profile, ...extra }
    : { ...profile, ...extra, modulePath: modulePathOf(profile) };

/** A `terminal-auth` method, exactly as an adapter advertises one. */
const terminalMethod = (id: string, command: string, args: readonly string[]): AuthMethod => ({
  id,
  name: id,
  _meta: { 'terminal-auth': { command, args, label: id } },
});

/** Claude adapter 0.70.0's two methods, advertised by a process this host started. */
const claudeShape = (execPath: string, modulePath: string): AuthMethod[] => [
  {
    id: 'claude-ai-login',
    name: 'Claude Subscription',
    description: 'Use Claude subscription ',
    _meta: {
      'terminal-auth': {
        command: execPath,
        args: [modulePath, '--cli', 'auth', 'login', '--claudeai'],
        label: 'Claude Login',
      },
    },
  },
  {
    id: 'console-login',
    name: 'Anthropic Console',
    description: 'Use Anthropic Console (API usage billing)',
    _meta: {
      'terminal-auth': {
        command: execPath,
        args: [modulePath, '--cli', 'auth', 'login', '--console'],
        label: 'Anthropic Console Login',
      },
    },
  },
];

const profilesWithModule = acpAgentProfiles.filter((profile) => profile.package !== undefined);

describe.each(acpAgentProfiles)('sign-in for $id', (profile) => {
  const loginCommand = profile.loginCommand ?? '';

  it('should declare a login command that starts with its CLI', () => {
    expect(loginCommand.split(' ')[0]).toBe(profile.cli);
  });

  it('should offer the profile login command first when the agent advertises nothing (L1)', () => {
    const login = loginOf(adapterOf(profile), [], posixHost);

    expect(login).toEqual({
      kind: 'external-agent-login',
      agentId: profile.id,
      authMethods: [{ id: 'cli-login', name: `Sign in to ${profile.displayName}`, terminalCommand: loginCommand }],
    });
  });

  it('should never surface the host runtime or the adapter module path (L2)', () => {
    const adapter = adapterOf(profile);
    const modulePath = adapter.modulePath ?? modulePathOf(profile);

    const login = loginOf(adapter, claudeShape(process.execPath, modulePath), posixHost);

    expect(login.authMethods[0]).toEqual({
      id: 'cli-login',
      name: `Sign in to ${profile.displayName}`,
      terminalCommand: loginCommand,
    });
    expect(login.authMethods.slice(1)).toEqual([
      { id: 'claude-ai-login', name: 'Claude Subscription', description: 'Use Claude subscription ' },
      { id: 'console-login', name: 'Anthropic Console', description: 'Use Anthropic Console (API usage billing)' },
    ]);
    for (const method of login.authMethods) {
      expect(method.terminalCommand ?? '').not.toContain(process.execPath);
      expect(method.terminalCommand ?? '').not.toContain(modulePath);
    }
  });

  it('should treat this process as the host runtime when no host is named (L2)', () => {
    const adapter = adapterOf(profile);

    const login = loginOf(adapter, claudeShape(process.execPath, adapter.modulePath ?? modulePathOf(profile)));

    expect(login.authMethods.map((method) => method.terminalCommand)).toEqual([loginCommand, undefined, undefined]);
  });

  it('should not list the login command twice (L4)', () => {
    const [cli = '', ...args] = loginCommand.split(' ');

    const login = loginOf(adapterOf(profile), [terminalMethod('vendor-login', cli, args)], posixHost);

    expect(login.authMethods).toEqual([{ id: 'vendor-login', name: 'vendor-login', terminalCommand: loginCommand }]);
  });

  it('should quote arguments a shell would split (L5)', () => {
    const login = loginOf(adapterOf(profile), [terminalMethod('other', '/opt/My Tools/agent', ["it's"])], posixHost);

    expect(login.authMethods.map((method) => method.terminalCommand)).toEqual([
      loginCommand,
      String.raw`'/opt/My Tools/agent' 'it'\''s'`,
    ]);
  });

  it('should quote arguments for PowerShell on Windows (L5)', () => {
    const login = loginOf(
      adapterOf(profile),
      [terminalMethod('other', String.raw`C:\My Tools\agent.exe`, ['a b', 'plain'])],
      {
        platform: 'win32',
        execPath: String.raw`C:\Program Files\Tau\Tau.exe`,
      },
    );

    expect(login.authMethods.at(1)?.terminalCommand).toBe(String.raw`& "C:\My Tools\agent.exe" "a b" plain`);
  });

  it('should name a CLI found outside PATH by its quoted absolute path (L6)', () => {
    const executablePath = `/Users/A User/Library/Application Support/${profile.cli ?? profile.id}`;
    const adapter = adapterOf(profile, { executablePath, executableSource: 'fallback' });

    const login = loginOf(adapter, [], posixHost);

    expect(login.authMethods).toEqual([
      {
        id: 'cli-login',
        name: `Sign in to ${profile.displayName}`,
        terminalCommand: `'${executablePath}'${loginCommand.slice((profile.cli ?? '').length)}`,
      },
    ]);
  });

  it('should name a CLI found outside PATH on Windows with the PowerShell call operator (L6)', () => {
    const executablePath = win32.join(String.raw`C:\Users\A User\.local\bin`, `${profile.cli ?? profile.id}.exe`);
    const adapter = adapterOf(profile, { executablePath, executableSource: 'fallback' });

    const login = loginOf(adapter, [], { platform: 'win32', execPath: String.raw`C:\Program Files\Tau\Tau.exe` });

    expect(login.authMethods[0]?.terminalCommand).toBe(
      `& "${executablePath}"${loginCommand.slice((profile.cli ?? '').length)}`,
    );
  });

  it('should keep the bare command for a CLI on PATH (L7)', () => {
    const adapter = adapterOf(profile, {
      executablePath: `/usr/local/bin/${profile.cli ?? ''}`,
      executableSource: 'path',
    });

    const login = loginOf(adapter, [], posixHost);

    expect(login.authMethods[0]?.terminalCommand).toBe(loginCommand);
  });
});

describe.each(profilesWithModule)('sign-in for module adapter $id', (profile) => {
  it('should drop a host-runtime command even when its command is another path (L3)', () => {
    const adapter = adapterOf(profile);

    const login = loginOf(adapter, claudeShape(helperPath, modulePathOf(profile)), posixHost);

    expect(login.authMethods.map((method) => method.id)).toEqual(['cli-login', 'claude-ai-login', 'console-login']);
    for (const method of login.authMethods) {
      expect(method.terminalCommand ?? '').not.toContain('Helper');
      expect(method.terminalCommand ?? '').not.toContain('app.asar');
    }
  });
});
