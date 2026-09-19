import { describe, expect, it } from 'vitest';
import { parseHostManifest } from '#host/host-manifest.js';
import { protocolVersion } from '#types/protocol-header.types.js';

const manifest = (capabilities: unknown[]) => ({ v: 2, hostId: 'local-host', capabilities });

describe('host manifest v2', () => {
  it('should advertise each service protocol independently of the manifest version', () => {
    const parsed = parseHostManifest(
      manifest([
        { kind: 'cad', protocolVersion, endpoint: { type: 'route', path: '/runtime/cad' }, granted: true },
        { kind: 'jobs', protocolVersion: 1, endpoint: { type: 'route', path: '/runtime/jobs/v1' }, granted: false },
        { kind: 'machines', protocolVersion: 1, endpoint: { type: 'port', name: 'machine-broker' }, granted: true },
        { kind: 'agent', protocolVersion: 1, endpoint: { type: 'port', name: 'agent' }, granted: false },
      ]),
    );
    expect(parsed.knownCapabilities.map(({ kind }) => kind)).toEqual(['cad', 'jobs', 'machines', 'agent']);
    expect(parsed.manifest.v).toBe(2);
    expect(parsed.knownCapabilities.map((capability) => capability.protocolVersion)).toEqual([
      protocolVersion,
      1,
      1,
      1,
    ]);
    expect(Object.isFrozen(parsed.manifest.capabilities)).toBe(true);
    expect(parsed.knownCapabilities[1]?.granted).toBe(false);
  });

  it.each([1, 2, 3, 4].filter((version) => version !== protocolVersion))(
    'should reject CAD wire version %s rather than accepting a mismatched endpoint',
    (version) => {
      expect(() =>
        parseHostManifest(
          manifest([{ kind: 'cad', protocolVersion: version, endpoint: { type: 'port', name: 'cad' }, granted: true }]),
        ),
      ).toThrow('UNSUPPORTED_HOST_CAPABILITY_PROTOCOL:cad');
    },
  );

  it.each(['jobs', 'machines', 'agent'])('should keep the %s service on its own protocol version', (kind) => {
    expect(() =>
      parseHostManifest(manifest([{ kind, protocolVersion, endpoint: { type: 'port', name: kind }, granted: true }])),
    ).toThrow(`UNSUPPORTED_HOST_CAPABILITY_PROTOCOL:${kind}`);
  });

  it('should preserve unknown records inertly without treating them as known capabilities', () => {
    const future = {
      kind: 'inspection',
      protocolVersion: 9,
      endpoint: 'https://example.test',
      data: { mode: 'future' },
    };
    const parsed = parseHostManifest(manifest([future]));
    future.data.mode = 'mutated';
    expect(parsed.knownCapabilities).toEqual([]);
    expect(parsed.unknownCapabilities).toEqual([
      { kind: 'inspection', protocolVersion: 9, endpoint: 'https://example.test', data: { mode: 'future' } },
    ]);
    expect(parseHostManifest(parsed.manifest).manifest).toEqual(parsed.manifest);
    expect(Object.isFrozen(parsed.unknownCapabilities[0]?.['data'])).toBe(true);
  });

  it.each([
    [
      'duplicate role',
      manifest([
        { kind: 'jobs', protocolVersion: 1, endpoint: { type: 'route', path: '/jobs' }, granted: true },
        { kind: 'jobs', protocolVersion: 1, endpoint: { type: 'route', path: '/jobs-two' }, granted: true },
      ]),
    ],
    [
      'known protocol',
      manifest([{ kind: 'jobs', protocolVersion: 2, endpoint: { type: 'route', path: '/jobs' }, granted: true }]),
    ],
    [
      'absolute URL',
      manifest([
        { kind: 'cad', protocolVersion, endpoint: { type: 'route', path: 'https://host.test/cad' }, granted: true },
      ]),
    ],
    [
      'scheme-relative URL',
      manifest([{ kind: 'cad', protocolVersion, endpoint: { type: 'route', path: '//host/cad' }, granted: true }]),
    ],
    [
      'dot segment',
      manifest([{ kind: 'cad', protocolVersion, endpoint: { type: 'route', path: '/runtime/../cad' }, granted: true }]),
    ],
    [
      'unnamed port',
      manifest([{ kind: 'machines', protocolVersion: 1, endpoint: { type: 'port', name: '' }, granted: true }]),
    ],
    [
      'unknown known-role key',
      manifest([
        { kind: 'agent', protocolVersion: 1, endpoint: { type: 'port', name: 'agent' }, granted: true, execute: true },
      ]),
    ],
  ])('should reject %s', (_name, input) => {
    expect(() => parseHostManifest(input)).toThrow();
  });

  it('should reject accessor and oversized input without executing the getter', () => {
    let reads = 0;
    const input = Object.defineProperty(manifest([]), 'surprise', {
      enumerable: true,
      get() {
        reads += 1;
        return true;
      },
    });
    expect(() => parseHostManifest(input)).toThrow();
    expect(reads).toBe(0);
    expect(() => parseHostManifest({ v: 2, hostId: 'x'.repeat(65_537), capabilities: [] })).toThrow(
      'HOST_MANIFEST_STRING_LIMIT',
    );
  });
});
