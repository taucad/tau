import { parameterEntryPath } from '@taucad/types';
import { compileParameterManifest } from '@taucad/parameters';
import type { ParameterManifest } from '@taucad/parameters';
import { describe, expect, it, vi } from 'vitest';
import { createParameterSetService } from '#services/parameter-set-service.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
type ManifestRevision = ParameterManifest['identity']['dependency'];
const revision = (value: string): ManifestRevision => value as ManifestRevision;
const digestBytes = async (bytes: Uint8Array<ArrayBuffer>): Promise<ManifestRevision> => {
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
  return revision(`sha256:${[...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`);
};
const sameBytes = (
  left: Uint8Array<ArrayBuffer> | undefined,
  // oxlint-disable-next-line typescript-eslint/no-restricted-types -- checked-write absence is represented as null by the filesystem contract.
  right: Uint8Array<ArrayBuffer> | string | null,
): boolean => {
  if (right === null) {
    return left === undefined;
  }
  const expected = typeof right === 'string' ? encoder.encode(right) : right;
  return (
    left !== undefined &&
    left.byteLength === expected.byteLength &&
    left.every((value, index) => value === expected[index])
  );
};

/** With no published entry map, the settled record on disk is the durable statement of the values. */
const parseEntry = (bytes: Uint8Array<ArrayBuffer> | undefined): unknown =>
  bytes === undefined ? undefined : JSON.parse(decoder.decode(bytes));

describe('createParameterSetService', () => {
  it('backs up legacy bytes and owns one checked parameter update through close', async () => {
    const rootDirectory = '/projects/example';
    const sourcePath = `${rootDirectory}/main.ts`;
    const dependencyPath = `${rootDirectory}/shared.ts`;
    const path = `${rootDirectory}/${parameterEntryPath('main.ts')}`;
    const configurationEntry = 'provider-configuration/runtime/export/stl/options/schema-revision';
    const configurationPath = `${rootDirectory}/${parameterEntryPath(configurationEntry)}`;
    const renamedConfigurationEntry = 'provider-configuration/runtime/export/stl/options/schema-revision-2';
    const renamedConfigurationPath = `${rootDirectory}/${parameterEntryPath(renamedConfigurationEntry)}`;
    const sourceBytes = encoder.encode('export const width = 100;');
    const dependencyBytes = encoder.encode('export const scale = 1;');
    const files = new Map<string, Uint8Array<ArrayBuffer>>([
      [sourcePath, sourceBytes],
      [dependencyPath, dependencyBytes],
      [
        path,
        encoder.encode(
          JSON.stringify({
            activeGroup: 'default',
            groups: { default: { values: { width: 100 } } },
          }),
        ),
      ],
    ]);
    const listeners = new Map<string, Set<() => void>>();
    const checkedUpdateStarted = Promise.withResolvers<void>();
    const releaseCheckedUpdate = Promise.withResolvers<void>();
    const retryUpdateStarted = Promise.withResolvers<void>();
    const releaseRetryUpdate = Promise.withResolvers<void>();
    const writeFileChecked = vi.fn(
      async (input: Parameters<Parameters<typeof createParameterSetService>[0]['client']['writeFileChecked']>[0]) => {
        const writesToSource = writeFileChecked.mock.calls.filter(([call]) => call.path === path).length;
        if (input.path === path && writesToSource === 3) {
          checkedUpdateStarted.resolve();
          await releaseCheckedUpdate.promise;
        }
        if (input.path === path && writesToSource === 4) {
          retryUpdateStarted.resolve();
          await releaseRetryUpdate.promise;
        }
        const conflict = input.preconditions.find(
          ({ path: preconditionPath, expected }) => !sameBytes(files.get(preconditionPath), expected),
        );
        if (conflict !== undefined) {
          const actual = files.get(conflict.path);
          return {
            status: 'conflict',
            conflicts: [
              {
                path: conflict.path,
                actual: actual === undefined ? null : new Uint8Array(actual),
              },
            ],
          } as const;
        }
        const data = typeof input.data === 'string' ? encoder.encode(input.data) : input.data;
        files.set(input.path, new Uint8Array(data));
        return {
          status: 'applied',
          content: new Uint8Array(data),
        } as const;
      },
    );
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- structural test double covers the service's six-method authority seam
    const client = {
      exists: async (candidate: string) => files.has(candidate),
      readFile: async (candidate: string) => {
        const content = files.get(candidate);
        return content === undefined ? new Uint8Array() : new Uint8Array(content);
      },
      writeFileChecked,
      move: async (source: string, target: string) => {
        const content = files.get(source);
        if (content === undefined) {
          throw new Error(`Missing move source: ${source}`);
        }
        files.set(target, content);
        files.delete(source);
        return { type: 'file', size: content.byteLength, mtimeMs: 0 } as const;
      },
      unlink: async (candidate: string) => {
        files.delete(candidate);
      },
      rmdir: async (candidate: string) => {
        for (const path of files.keys()) {
          if (path === candidate || path.startsWith(`${candidate}/`)) {
            files.delete(path);
          }
        }
      },
      mkdir: async () => undefined,
    } as unknown as Parameters<typeof createParameterSetService>[0]['client'];
    const service = createParameterSetService({
      rootDirectory,
      client,
      subscribe: (candidate, listener) => {
        const current = listeners.get(candidate) ?? new Set();
        current.add(listener);
        listeners.set(candidate, current);
        return () => current.delete(listener);
      },
    });
    const backup = vi.fn(async () => 'revision:before-units-migration');
    service.setBackupOwner(backup);
    const sourceRevision = revision(`sha256:${'1'.repeat(64)}`);
    const manifest = await compileParameterManifest({
      declaration: {
        schema: {
          $schema: 'https://json-structure.org/meta/extended/v0/#',
          $id: 'urn:test:browser-parameters',
          $uses: ['JSONSchemaUnits'],
          name: 'Parameters',
          type: 'object',
          properties: { width: { type: 'double', ucumUnit: 'mm' } },
        },
        defaults: { width: 100 },
        bindings: {
          '/width': {
            parameterId: 'width',
            quantityKind: 'http://qudt.org/vocab/quantitykind/Length',
            space: 'linear',
          },
        },
      },
      scope: {
        kind: 'source',
        authority: 'browser-filesystem',
        root: rootDirectory,
        entry: 'main.ts',
      },
      source: {
        id: 'fixture',
        version: '1',
        revision: sourceRevision,
        capability: 'json-structure',
      },
      dependency: sourceRevision,
      middleware: sourceRevision,
      sourceFiles: {
        'main.ts': await digestBytes(sourceBytes),
        'shared.ts': await digestBytes(dependencyBytes),
      },
    });
    const configurationManifest = await compileParameterManifest({
      declaration: {
        schema: manifest.schema,
        resources: manifest.resources,
        defaults: manifest.defaults,
        bindings: manifest.bindingDeclarations,
      },
      scope: {
        kind: 'provider',
        provider: 'runtime',
        configuration: 'export/stl/options',
      },
      source: {
        id: 'runtime:export/stl/options',
        version: '1',
        revision: sourceRevision,
        capability: 'json-structure',
      },
      dependency: sourceRevision,
      middleware: sourceRevision,
    });
    const configurationTarget = service.target(configurationEntry, 'provider-configuration');

    files.set(sourcePath, encoder.encode('export const width = 101;'));
    await expect(service.resolve('main.ts', manifest)).rejects.toMatchObject({ code: 'STALE_MANIFEST' });
    files.set(sourcePath, sourceBytes);
    files.set(dependencyPath, encoder.encode('export const scale = 2;'));
    await expect(service.resolve('main.ts', manifest)).rejects.toMatchObject({ code: 'STALE_MANIFEST' });
    expect(writeFileChecked).not.toHaveBeenCalled();
    files.set(dependencyPath, dependencyBytes);

    const [sourceSnapshot, duplicateSnapshot] = await Promise.all([
      service.resolve('main.ts', manifest),
      service.resolve('main.ts', manifest),
    ]);
    expect(duplicateSnapshot).toEqual(sourceSnapshot);
    expect(service.snapshot('main.ts')).toEqual(sourceSnapshot);
    const widthBinding = manifest.bindings['/width'];
    if (widthBinding === undefined) {
      throw new Error('Expected the compiled width binding.');
    }
    const input = {
      editorInstance: 'editor-a',
      binding: {
        target: service.target('main.ts'),
        group: 'default',
        parameterId: widthBinding.parameter.value,
        resource: widthBinding.schema.resource,
        pointer: '/width',
        nativeUnit: 'mm',
        representation: 'binary64',
        constraints: {},
      },
      acknowledgedValue: 100,
      acknowledgedRevision: sourceSnapshot.identity,
      display: { locale: 'en', unit: 'mm' },
    } as const;
    const retained = service.input(input);
    retained.attach()();
    const detach = retained.attach();
    await Promise.resolve();
    expect(retained.actor.getSnapshot().status).toBe('active');
    retained.actor.send({ type: 'focus' });
    retained.actor.send({ type: 'changeRaw', text: 'not a quantity' });
    detach();
    const remounted = service.input(input);
    expect(remounted.actor).toBe(retained.actor);
    expect(remounted.actor.getSnapshot().context.draft?.raw).toBe('not a quantity');
    remounted.actor.send({ type: 'pressEscape' });
    remounted.actor.send({ type: 'focus' });
    remounted.actor.send({ type: 'changeRaw', text: '2.1 cm' });
    expect(remounted.actor.getSnapshot().context.draft).toMatchObject({
      raw: '2.1 cm',
      status: 'complete-valid',
      nativeValue: 21,
    });
    remounted.actor.send({ type: 'pressEnter' });
    await vi.waitFor(() => {
      expect(remounted.actor.getSnapshot().context.acknowledged.value).toBe(21);
      expect(remounted.actor.getSnapshot().context.draft).toBeUndefined();
    });
    remounted.attach()();
    await service.resolveTarget(configurationTarget, configurationManifest);
    expect(files.has(configurationPath)).toBe(false);
    await service.replaceTargetValues(configurationTarget, configurationManifest, { values: { width: 75 } });
    const relocation = await service.prepareFileOperation({
      kind: 'move',
      oldPath: configurationEntry,
      newPath: renamedConfigurationEntry,
    });
    await expect(service.resolve(configurationEntry, configurationManifest)).rejects.toMatchObject({
      code: 'PARAMETER_RELOCATING',
    });
    await relocation.commit();
    expect(files.has(configurationPath)).toBe(false);
    expect(files.has(renamedConfigurationPath)).toBe(true);
    const update = service.replaceValues('main.ts', manifest, { width: 125 });
    await checkedUpdateStarted.promise;
    files.set(sourcePath, encoder.encode('export const width = 999;'));
    releaseCheckedUpdate.resolve();
    await expect(update).rejects.toMatchObject({ code: 'STALE_MANIFEST' });
    files.set(sourcePath, sourceBytes);
    await service.resolve('main.ts', manifest);
    const retryUpdate = service.replaceValues('main.ts', manifest, { width: 125 });
    await retryUpdateStarted.promise;
    remounted.actor.send({ type: 'focus' });
    remounted.actor.send({ type: 'changeRaw', text: 'not a quantity' });
    let closeSettled = false;
    const close = (async (): Promise<void> => {
      await service.close();
      closeSettled = true;
    })();
    await Promise.resolve();
    expect(closeSettled).toBe(false);
    releaseRetryUpdate.resolve();
    await retryUpdate;
    await expect(close).rejects.toMatchObject({ code: 'INVALID_DRAFTS' });
    retained.actor.send({ type: 'discard' });
    await service.close();

    expect(backup).toHaveBeenCalledOnce();
    expect(writeFileChecked).toHaveBeenCalledTimes(5);
    expect(configurationTarget).toEqual({
      authority: 'provider-configuration',
      root: rootDirectory,
      entry: configurationEntry,
    });
    expect(parseEntry(files.get(renamedConfigurationPath))).toMatchObject({
      groups: { default: { values: { width: 75 } } },
    });
    expect(parseEntry(files.get(path))).toMatchObject({
      recordVersion: 1,
      profile: 'tau-json-structure-units-03-v1',
      migration: { backupRevision: 'revision:before-units-migration' },
      groups: {
        default: {
          values: { width: 125 },
          bindings: { '/width': { unit: 'mm', representation: 'binary64' } },
        },
      },
    });
    expect(decoder.decode(files.get(path))).toContain('"recordVersion": 1');
    expect(decoder.decode(files.get(renamedConfigurationPath))).toContain('"width": 75');
    expect([...listeners.values()].every((current) => current.size === 0)).toBe(true);
    await expect(service.close()).resolves.toBeUndefined();
  });
});
