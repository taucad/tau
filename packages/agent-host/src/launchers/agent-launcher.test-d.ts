/* RH-A25 (RV8-F2): the launcher surface, as the approved resident-host guide names it (option one-launcher). */
import { describe, expectTypeOf, it } from 'vitest';
import { createAgentLauncher, serveAgentChannel } from '#launchers/index.js';
import type * as Launcher from '#launchers/index.js';
import type * as Node from '#node.js';
import type * as Browser from '#browser.js';
import type { AgentLauncher, AgentLauncherOptions, ChatStore, CredentialState } from '#launchers/index.js';
import type { CommandAnswer, HostCommand } from '#wire/commands.schema.js';
import type { ReadAnswer, ReadInput } from '#wire/frames.schema.js';

describe('the launcher exports', () => {
  it('should build one launcher from one options object', () => {
    expectTypeOf(createAgentLauncher).toEqualTypeOf<(options: AgentLauncherOptions) => AgentLauncher>();
    expectTypeOf<AgentLauncherOptions['chats']>().toEqualTypeOf<ChatStore>();
    expectTypeOf<AgentLauncherOptions['credential']>().toEqualTypeOf<() => CredentialState>();
  });

  it('should answer commands and reads, never throwing a refusal', () => {
    expectTypeOf<AgentLauncher['execute']>().toEqualTypeOf<(command: HostCommand) => Promise<CommandAnswer>>();
    expectTypeOf<AgentLauncher['read']>().toEqualTypeOf<(input: ReadInput) => Promise<ReadAnswer>>();
  });

  it('should serve a connection with the launcher, not a project host', () => {
    expectTypeOf(serveAgentChannel).parameter(1).toEqualTypeOf<AgentLauncher>();
  });

  it('should make a store only from a platform module', () => {
    expectTypeOf<Node.NodeChatStoreOptions>().toEqualTypeOf<Readonly<{ workspaceRoot: string }>>();
    expectTypeOf<ReturnType<typeof Node.createNodeChatStore>>().toEqualTypeOf<ChatStore>();
    expectTypeOf<ReturnType<typeof Browser.createBrowserChatStore>>().toEqualTypeOf<ChatStore>();
    // @ts-expect-error a paired credential always carries its bearer.
    const unpairedBearer: CredentialState = { mode: 'paired' };
    expectTypeOf(unpairedBearer).toEqualTypeOf<CredentialState>();
  });

  // Leak guard: leadership is inside the store, so no caller can hand-roll an always-`leader` port (RH-R2).
  it('should not export leadership or the old Node launcher', () => {
    // @ts-expect-error the leadership port is internal (guide question `leadership-port`).
    expectTypeOf<Launcher.LeadershipPort>().not.toBeNever();
    expectTypeOf<'createChatStore' extends keyof typeof Launcher ? true : false>().toEqualTypeOf<false>();
    expectTypeOf<'createNodeAgentLauncher' extends keyof typeof Launcher ? true : false>().toEqualTypeOf<false>();
    expectTypeOf<'createNodeLeadership' extends keyof typeof Node ? true : false>().toEqualTypeOf<false>();
    expectTypeOf<'createBrowserLeadership' extends keyof typeof Browser ? true : false>().toEqualTypeOf<false>();
  });
});
