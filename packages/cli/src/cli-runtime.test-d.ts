import { describe, expectTypeOf, it } from 'vitest';
import { defineRuntime } from '@taucad/runtime';
import type { RuntimeClient } from '@taucad/runtime';
import { createNodeClient } from '@taucad/runtime/node';
import type { HostRuntimeClient } from '@taucad/host/agent-tools';
import { createCliRuntime } from '#cli-runtime.js';
import type { CliRuntimeOptions } from '#cli-runtime.js';

const createTscircuitRuntime = async () => {
  const { tscircuit } = await import('@taucad/tscircuit');
  return defineRuntime({ plugins: [tscircuit()] });
};
const createOpenrscadRuntime = async () => {
  const { openrscad } = await import('@taucad/openrscad');
  return defineRuntime({ plugins: [openrscad()] });
};
type TscircuitRuntime = Awaited<ReturnType<typeof createTscircuitRuntime>>;
type OpenrscadRuntime = Awaited<ReturnType<typeof createOpenrscadRuntime>>;
type TscircuitDocument = ReturnType<RuntimeClient<TscircuitRuntime>['open']>;
type OpenrscadDocument = ReturnType<RuntimeClient<OpenrscadRuntime>['open']>;

const createCliHostClient = async () => {
  const runtime = await createCliRuntime();
  return createNodeClient({ runtime, projectPath: '/tmp' });
};

describe('createCliRuntime types', () => {
  it('takes only loaded plugin factories and configured instances', () => {
    expectTypeOf<Parameters<typeof createCliRuntime>>().toEqualTypeOf<[options?: CliRuntimeOptions]>();
  });

  it('passes the real CLI dynamic runtime client to the host without widening finite clients', () => {
    expectTypeOf<Awaited<ReturnType<typeof createCliHostClient>>>().toExtend<HostRuntimeClient>();
    expectTypeOf<RuntimeClient<TscircuitRuntime>>().not.toExtend<HostRuntimeClient>();
    expectTypeOf<RuntimeClient<OpenrscadRuntime>>().toExtend<HostRuntimeClient>();
  });

  it('preserves exact requests on the concrete kernels', () => {
    const useFiniteDocuments = (tscircuitDocument: TscircuitDocument, openrscadDocument: OpenrscadDocument): void => {
      tscircuitDocument.view('pcb', { options: { pinNumbers: true } });
      void tscircuitDocument.export('bom');
      openrscadDocument.view('model');
      void openrscadDocument.export('glb');
      // @ts-expect-error -- only the PCB view accepts pin-number presentation.
      tscircuitDocument.view('board', { options: { pinNumbers: true } });
      // @ts-expect-error -- OpenRSCAD does not offer a BOM export.
      void openrscadDocument.export('bom');
    };
    expectTypeOf(useFiniteDocuments).toBeFunction();
  });
});
