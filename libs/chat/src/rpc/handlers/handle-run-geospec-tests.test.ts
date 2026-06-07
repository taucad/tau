import { describe, expect, it, vi } from 'vitest';
import { rpcName } from '#constants/rpc.constants.js';
import { rpcSchemasRegistry } from '#schemas/rpc.schema.js';
import { handleRunGeoSpecTests } from '#rpc/handlers/handle-run-geospec-tests.js';
import type { RpcGeoSpecClient } from '#rpc/rpc-dependencies.js';

const runGeoSpecTestsInputSchema = rpcSchemasRegistry[rpcName.runGeoSpecTests].inputSchema;

describe('handleRunGeoSpecTests', () => {
  it('should accept Vitest-aligned include and exclude filter input', () => {
    const parsed = runGeoSpecTestsInputSchema.safeParse({
      include: ['parts/**/*.geospec.ts'],
      exclude: ['**/*.slow.geospec.ts'],
    });

    expect(parsed.success).toBe(true);
  });

  it('should accept GeoSpec CLI-compatible file and test-name filter input', () => {
    const parsed = runGeoSpecTestsInputSchema.safeParse({
      files: ['main.geospec.ts', 'parts/bracket.geospec.ts'],
      testNamePattern: '^(?!.*known failing check).*',
      testTimeout: 15_000,
    });

    expect(parsed.success).toBe(true);
  });

  it('delegates to the supplied in-process GeoSpec client', async () => {
    const geospec: RpcGeoSpecClient = {
      runTests: vi.fn().mockResolvedValue({
        success: true,
        failures: [],
        passes: [
          {
            id: 'main.geospec.ts:main dimensions > width',
            requirement: 'main dimensions > width',
            targetFile: 'main.geospec.ts',
          },
        ],
        passed: 1,
        total: 1,
      }),
    };

    const input = {
      files: ['main.geospec.ts'],
      include: ['**/*.geospec.ts'],
      exclude: ['**/*.slow.geospec.ts'],
      testNamePattern: 'width|height',
      testTimeout: 15_000,
    };

    const result = await handleRunGeoSpecTests(input, geospec);

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        passed: 1,
        total: 1,
      }),
    );
    expect(geospec.runTests).toHaveBeenCalledWith(input);
  });

  it('returns a client error when no GeoSpec client is available', async () => {
    const result = await handleRunGeoSpecTests({}, undefined);

    expect(result).toEqual({
      success: false,
      errorCode: 'UNKNOWN',
      message: 'GeoSpec tests require a browser-connected Tau runner.',
    });
  });
});
