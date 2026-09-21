import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageChannel } from 'node:worker_threads';
import { NodeFsChannel, NodeFsProviderClient } from '@taucad/filesystem/backend';
import { NodeFsAuthorityHost, serveNodeFsProvider, toNodeFsPort } from '@taucad/filesystem/backend/node';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import { createActor, fromPromise, waitFor } from 'xstate';
import { compileParameterManifest, readParameterRecord } from '@taucad/parameters';
import { loadParameterSnapshot, commitParameterChange, refreshParameterSnapshot } from '@taucad/parameters/authority';
import type { ParameterAuthority } from '@taucad/parameters/authority';
import { parameterSetMachine, submitParameterRequest } from '@taucad/parameters/set-machine';
import { expect, it } from 'vitest';

it('admits one writer across two actual Node transport clients and refreshes the losing actor', async () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'tau-parameter-actor-'));
  const root = join(sandbox, 'root');
  const authorityRoot = join(sandbox, 'authority');
  const path = '.tau/parameters/main.ts.json';
  mkdirSync(join(root, '.tau', 'parameters'), { recursive: true });
  mkdirSync(authorityRoot);
  writeFileSync(join(root, 'main.ts'), 'source:1');
  const authority = new NodeFsAuthorityHost({ authorityDirectory: () => authorityRoot, authorityIdentity: () => root });
  const ports = [new MessageChannel(), new MessageChannel()];
  const stops = ports.map(({ port2 }) =>
    serveNodeFsProvider(toNodeFsPort(port2), {
      policy: tauPathPolicy,
      allowRoot: (candidate) => candidate === root,
      authority,
    }),
  );
  const connections = ports.map(({ port1 }) => {
    const channel = new NodeFsChannel(toNodeFsPort(port1));
    return { channel, provider: new NodeFsProviderClient(channel, root) };
  });
  const target = { authority: 'node', root, entry: 'main.ts' };
  type Digest = Parameters<typeof compileParameterManifest>[0]['dependency'];
  const digest = `sha256:${'1'.repeat(64)}` as Digest;
  // The loader proves the manifest was compiled from the pinned source bytes.
  const sourceDigest = `sha256:${createHash('sha256').update('source:1').digest('hex')}` as Digest;
  const manifest = await compileParameterManifest({
    declaration: {
      schema: {
        $schema: 'https://json-structure.org/meta/extended/v0/#',
        $id: 'urn:test:node-parameters',
        $uses: ['JSONSchemaUnits'],
        name: 'Parameters',
        type: 'object',
        properties: { width: { type: 'double' } },
      },
      defaults: { width: 10 },
    },
    scope: { kind: 'source', ...target },
    source: { id: 'fixture', version: '1', revision: digest, capability: 'json-structure' },
    dependency: digest,
    middleware: digest,
    sourceFiles: { 'main.ts': sourceDigest },
  });
  const actors = connections.map(({ provider }) => {
    const byteAuthority: ParameterAuthority = {
      path: () => path,
      read: async () => ((await provider.exists(path)) ? provider.readFile(path) : null),
      writeChecked: async (write) => provider.writeFileChecked(write),
    };
    return createActor(
      parameterSetMachine.provide({
        actors: {
          loadParameterSet: fromPromise(async ({ input, signal }) =>
            input.current === undefined
              ? loadParameterSnapshot({ target, authority: byteAuthority, manifest: async () => manifest, signal })
              : refreshParameterSnapshot({ current: input.current, authority: byteAuthority, signal }),
          ),
          commitParameterSet: fromPromise(async ({ input: change, signal }) =>
            commitParameterChange({ change, authority: byteAuthority, signal }),
          ),
        },
      }),
      { input: { target } },
    );
  });
  try {
    for (const actor of actors) {
      actor.start();
    }
    const snapshots = await Promise.all(
      actors.map(async (actor) => waitFor(actor, (snapshot) => snapshot.matches({ open: 'ready' }))),
    );
    expect(await connections[0]!.provider.exists(path)).toBe(false);
    const outcomes = await Promise.all(
      actors.map(async (actor, index) =>
        submitParameterRequest(actor, {
          requestId: `writer:${index}`,
          fingerprint: `writer:${index}`,
          pressure: 'final',
          expected: snapshots[index]!.context.current!.identity,
          // Only `base` decides a conflict: the loser re-plans against the winner's bytes and is refused
          // because the field it edited from 10 has moved.
          base: { pointer: '/width', value: 10 },
          operation: {
            kind: 'native-value',
            group: 'default',
            pointer: '/width',
            value: 20 + index,
          },
        }),
      ),
    );
    expect(outcomes.map((outcome) => outcome.status).sort()).toEqual(['committed', 'rejected']);
    const settled = await Promise.all(
      actors.map(async (actor) => waitFor(actor, (snapshot) => snapshot.matches({ open: 'ready' }))),
    );
    expect(settled[0]!.context.current!.identity).toEqual(settled[1]!.context.current!.identity);
    const record = readParameterRecord(await connections[0]!.provider.readFile(path));
    expect(record.status).toBe('current');
    if (record.status !== 'current') {
      throw new Error('Expected persisted record');
    }
    // The record names no writer: the losing actor learns it lost from its own checked write.
    expect(Object.keys(record.record)).toEqual(['activeGroup', 'groups']);
    expect(record.record.groups['default']!.values['width']).toBe(outcomes[0]!.status === 'committed' ? 20 : 21);
  } finally {
    for (const actor of actors) {
      actor.stop();
    }
    for (const { channel } of connections) {
      channel.close();
    }
    await Promise.all(stops.map(async (stop) => stop()));
    for (const { port2 } of ports) {
      port2.close();
    }
    rmSync(sandbox, { recursive: true, force: true });
  }
});
