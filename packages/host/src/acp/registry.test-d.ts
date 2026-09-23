import { expectTypeOf, it } from 'vitest';
import type { AcpAdapter, AcpAgentProfile } from '@taucad/host';

it('accepts exactly one complete ACP launch variant', () => {
  type Identity = { id: string; displayName: string; configEnv: string[] };
  type Native = Identity & { cli: string; args: string[] };
  type Module = Identity & { package: string; version: string };
  expectTypeOf<Native>().toExtend<AcpAgentProfile>();
  expectTypeOf<Native>().toExtend<AcpAdapter>();
  expectTypeOf<Module>().toExtend<AcpAgentProfile>();
  expectTypeOf<Module & { modulePath: string }>().toExtend<AcpAdapter>();
  expectTypeOf<Module>().not.toExtend<AcpAdapter>();
  expectTypeOf<Identity & { args: string[] }>().not.toExtend<AcpAgentProfile>();
  expectTypeOf<Native & Module>().not.toExtend<AcpAgentProfile>();
  expectTypeOf<Native & { modulePath: string }>().not.toExtend<AcpAdapter>();
});
