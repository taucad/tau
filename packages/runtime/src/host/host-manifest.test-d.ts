import { expectTypeOf, test } from 'vitest';
import type { HostCapabilityDescriptor } from '#host/host-manifest.js';
import { protocolVersion } from '#types/protocol-header.types.js';

test('service identity narrows its actual protocol version', () => {
  expectTypeOf<Extract<HostCapabilityDescriptor, { kind: 'cad' }>['protocolVersion']>().toEqualTypeOf<
    typeof protocolVersion
  >();
  expectTypeOf<Exclude<HostCapabilityDescriptor, { kind: 'cad' }>['protocolVersion']>().toEqualTypeOf<1>();
  const endpoint = { type: 'port', name: 'cad' } as const;
  const valid: HostCapabilityDescriptor = { kind: 'cad', protocolVersion, endpoint, granted: false };
  expectTypeOf(valid.protocolVersion).toEqualTypeOf<typeof protocolVersion>();
  // @ts-expect-error The CAD service does not speak the initial jobs/machines protocol.
  const invalid: HostCapabilityDescriptor = { kind: 'cad', protocolVersion: 1, endpoint, granted: false };
  expectTypeOf(invalid).toMatchTypeOf<HostCapabilityDescriptor>();
});
