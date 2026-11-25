import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { sha256Bytes } from '@taucad/utils/hash';
import { noteManifestReconciled, reconciledManifest, useReconciledManifest } from '#lib/manifest-reconciliation.js';

const encoder = new TextEncoder();

describe('manifest reconciliation (STO-25)', () => {
  it('names the digest of the bytes the loaded manifest was found equal to', async () => {
    const bytes = encoder.encode('{"name":"Gear"}');
    noteManifestReconciled('project-a', bytes);
    /* Unknown until hashed, never an older finding's. */
    expect(reconciledManifest('project-a')).toBeUndefined();
    const digest = await sha256Bytes(bytes);
    await expect.poll(() => reconciledManifest('project-a')).toBe(digest);
    noteManifestReconciled('project-a', undefined);
    expect(reconciledManifest('project-a')).toBeUndefined();
  });

  it('lets only the latest finding speak when an older digest settles after it', async () => {
    const older = encoder.encode('{"name":"Placeholder"}');
    noteManifestReconciled('project-b', older);
    /* A reload begins before the older digest is known. */
    noteManifestReconciled('project-b', undefined);
    await sha256Bytes(older);
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
    expect(reconciledManifest('project-b')).toBeUndefined();
  });

  it('keeps a finding through a re-check of the same bytes, never closing for the time a digest takes', async () => {
    const bytes = encoder.encode('{"name":"Shaft"}');
    noteManifestReconciled('project-e', bytes);
    const digest = await sha256Bytes(bytes);
    await expect.poll(() => reconciledManifest('project-e')).toBe(digest);
    noteManifestReconciled('project-e', bytes);
    expect(reconciledManifest('project-e')).toBe(digest);
  });

  it('keeps each project to its own finding, and tells a component when it changes', async () => {
    const bytes = encoder.encode('{"name":"Bracket"}');
    const { result } = renderHook(() => useReconciledManifest('project-c'));
    expect(result.current).toBeUndefined();
    act(() => {
      noteManifestReconciled('project-c', bytes);
    });
    const digest = await sha256Bytes(bytes);
    await expect.poll(() => result.current).toBe(digest);
    expect(reconciledManifest('project-d')).toBeUndefined();
    act(() => {
      noteManifestReconciled('project-c', undefined);
    });
    expect(result.current).toBeUndefined();
  });
});
