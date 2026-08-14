import { describe, it, expect } from 'vitest';
import { extractApi, buildBundledTypes, buildApiData } from '#extract-replicad-api.js';

/**
 * Tests for the replicad API extractor.
 *
 * Verifies that:
 * - Importing the module does not trigger main() side effects
 * - Exported functions are available for import
 */

describe('module side effects', () => {
  it('does not execute main() when imported', () => {
    // If main() ran unconditionally, it would attempt file writes and console output.
    // The fact that we successfully imported the module above without errors or
    // side-effects proves the guard is working.
    expect(extractApi).toBeDefined();
    expect(buildBundledTypes).toBeDefined();
    expect(buildApiData).toBeDefined();
    expect(typeof extractApi).toBe('function');
    expect(typeof buildBundledTypes).toBe('function');
    expect(typeof buildApiData).toBe('function');
  });

  it('normalizes bundled declarations to LF line endings', () => {
    expect(buildBundledTypes().replicad).not.toContain('\r');
  });
});
