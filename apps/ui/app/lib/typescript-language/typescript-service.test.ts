import { describe, expect, it, vi } from 'vitest';
import { EditorDocument } from '#lib/editor-document.js';
import { TypeAcquisitionController } from '#lib/typescript-language/type-acquisition.js';
import { TypeScriptService } from '#lib/typescript-language/typescript-service.js';
import type { TypeScriptWorkerPort } from '#lib/typescript-language/typescript-service.js';

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let release = (): void => {
    throw new Error('not initialized');
  };
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, resolve: release };
}

function fixture(open: TypeScriptWorkerPort['open'] = vi.fn(async () => undefined)) {
  const client: TypeScriptWorkerPort = {
    open,
    change: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    setExtraLib: vi.fn(async () => undefined),
    removeExtraLib: vi.fn(async () => undefined),
    request: vi.fn(async () => {
      throw new Error('No semantic request expected in lifecycle test');
    }),
    dispose: vi.fn(),
  };
  const acquisition = new TypeAcquisitionController({ client, staticTypes: [], dynamicTypes: false });
  return { service: new TypeScriptService(client, acquisition), client };
}

describe('TypeScriptService document lifecycle', () => {
  it('subscribes before the initial worker round-trip and replays the intervening UTF-16 edit', async () => {
    const gate = deferred();
    const { service, client } = fixture(vi.fn(async () => gate.promise));
    const document = new EditorDocument('main.ts', 'const x = 1;');
    const attaching = service.attach(document);
    const changed = document.apply({
      expectedVersion: 1,
      origin: 'view',
      changes: [{ from: 10, to: 11, insert: '2' }],
    });
    expect(changed?.version).toBe(2);
    gate.resolve();
    await attaching;
    expect(client.open).toHaveBeenCalledWith('file:///main.ts', 'const x = 1;', 1);
    expect(client.change).toHaveBeenCalledWith(changed);
    await service.detach(document);
    service.dispose();
  });

  it('shares one worker document across split views and closes on final detach', async () => {
    const { service, client } = fixture();
    const document = new EditorDocument('main.ts', 'const x = 1;');
    await Promise.all([service.attach(document), service.attach(document)]);
    expect(client.open).toHaveBeenCalledTimes(1);
    await service.detach(document);
    expect(client.close).not.toHaveBeenCalled();
    await service.detach(document);
    expect(client.close).toHaveBeenCalledOnce();
    service.dispose();
  });

  it('does not let a pending old detach close a newly attached document', async () => {
    const first = deferred();
    const { service, client } = fixture(
      vi
        .fn()
        .mockImplementationOnce(async () => first.promise)
        .mockImplementation(async () => undefined),
    );
    const document = new EditorDocument('main.ts', 'const x = 1;');
    const attaching = service.attach(document);
    const detaching = service.detach(document);
    const reattaching = service.attach(document);
    first.resolve();
    await Promise.all([attaching, detaching, reattaching]);
    expect(client.close).not.toHaveBeenCalled();
    await service.detach(document);
    expect(client.close).toHaveBeenCalledOnce();
    service.dispose();
  });

  it('moves an attached worker mirror to the document URI after a filesystem rename', async () => {
    const { service, client } = fixture();
    const document = new EditorDocument('old.ts', 'export const value = 1;');
    await service.attach(document);
    document.rename('new.ts');
    await service.relocate(document);
    expect(client.close).toHaveBeenCalledWith('file:///old.ts');
    expect(client.open).toHaveBeenCalledWith('file:///new.ts', 'export const value = 1;', 1);
    await service.detach(document);
    expect(client.close).toHaveBeenLastCalledWith('file:///new.ts');
    service.dispose();
  });
});
