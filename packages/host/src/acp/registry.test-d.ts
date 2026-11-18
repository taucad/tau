import { expectTypeOf, it } from 'vitest';
import type { AcpAdapter, AcpAgentProfile } from '@taucad/host';

import { acpAgentProfiles } from '#acp/registry.js';
import type { ReviewedAcpAgentProfile } from '#acp/registry.js';

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

it('should require every field the ACP agent policy names on a reviewed profile', () => {
  type Commands = { posix: string; windows: string };
  type Complete = {
    id: string;
    displayName: string;
    configEnv: string[];
    cli: string;
    args: string[];
    minimumCliVersion: string;
    versionSample: string;
    fallbackExecutables: { darwin: string[]; linux: string[]; win32: string[] };
    installCommand: Commands;
    updateCommand: Commands;
    loginCommand: string;
    loginArgs: string[];
    defaultModePreference: string[];
  };
  expectTypeOf<Complete>().toExtend<ReviewedAcpAgentProfile>();
  expectTypeOf<Omit<Complete, 'installCommand'>>().not.toExtend<ReviewedAcpAgentProfile>();
  expectTypeOf<Omit<Complete, 'updateCommand'>>().not.toExtend<ReviewedAcpAgentProfile>();
  expectTypeOf<Omit<Complete, 'versionSample'>>().not.toExtend<ReviewedAcpAgentProfile>();
  expectTypeOf<Omit<Complete, 'loginCommand'>>().not.toExtend<ReviewedAcpAgentProfile>();
  expectTypeOf<Omit<Complete, 'loginArgs'>>().not.toExtend<ReviewedAcpAgentProfile>();
  expectTypeOf<Omit<Complete, 'defaultModePreference'>>().not.toExtend<ReviewedAcpAgentProfile>();
  expectTypeOf<
    Omit<Complete, 'fallbackExecutables'> & { fallbackExecutables: { darwin: string[]; linux: string[] } }
  >().not.toExtend<ReviewedAcpAgentProfile>();
  expectTypeOf<
    Omit<Complete, 'installCommand'> & { installCommand: { posix: string } }
  >().not.toExtend<ReviewedAcpAgentProfile>();
  /* The reviewed set is complete, and still usable wherever a plain profile is. */
  expectTypeOf(acpAgentProfiles).toEqualTypeOf<readonly ReviewedAcpAgentProfile[]>();
  expectTypeOf<ReviewedAcpAgentProfile>().toExtend<AcpAgentProfile>();
});
