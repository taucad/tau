import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { contentDigest } from '@taucad/cache-core';
import type { ActorRefFrom, SnapshotFrom } from 'xstate';
import type { AdmittedAssembly, PublishedAssembly } from '@taucad/runtime/types';
import type { cadMachine } from '#machines/cad.machine.js';
import type { graphicsMachine } from '#machines/graphics.machine.js';
import type { kinematicsMachine, KinematicsUnitState } from '#machines/kinematics.machine.js';
import type { PublishedAssemblyDocument } from '@taucad/runtime/client';
import type { AppRuntimeClient } from '#types/runtime-client.alias.js';

vi.hoisted(() => {
  Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'iPhone CriOS/140' });
  vi.stubGlobal('webkit', {});
});
const toastError = vi.hoisted(() => vi.fn());
vi.mock('#components/ui/sonner.js', () => ({ toast: { error: toastError } }));
const { useAr } = await import('./use-ar.js');

const root = {
  path: 'scene.json',
  digest: contentDigest({ value: `sha256:${'0'.repeat(64)}`, name: 'AR fixture root' }),
  byteLength: 42,
} as const;
const assembly = mock<PublishedAssembly>();
Object.assign(assembly, {
  parts: { part: { variants: { default: { glb: mock() } } } },
  occurrences: [
    { id: 'part', part: 'part', variant: 'default', transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] },
  ],
});
function fixture(outcome: 'success' | 'failure' = 'success', hash: string = root.digest) {
  const client = mock<AppRuntimeClient>();
  Object.defineProperty(client, 'capabilities', {
    value: {
      routes: [
        {
          targetFormat: 'usdz',
          kernelId: 'converter',
          sourceFormat: 'glb',
          fidelity: 'mesh',
          transcoderId: 'assimp',
          exportOptions: { schema: {}, defaults: {} },
        },
      ],
      renderCapabilities: {},
      registrations: [],
    },
  });
  const document = mock<PublishedAssemblyDocument>();
  vi.mocked(document.exportPublished).mockResolvedValue({
    success: true,
    exportId: 'ar-export',
    issues: [],
    files: [{ name: 'scene.usdz', mimeType: 'model/vnd.usdz+zip', bytes: new Uint8Array([1]) }],
  });
  const actor = mock<ActorRefFrom<typeof cadMachine>>();
  const admitted = mock<AdmittedAssembly>();
  Object.assign(admitted, { publication: assembly });
  const display = { root: hash === root.digest ? root : { ...root }, admitted, document };
  const cadSnapshot = mock<SnapshotFrom<typeof cadMachine>>();
  Object.assign(cadSnapshot, {
    context: {
      kernelClient: client,
      publishedAssemblyRoot: root,
      publishedAssembly: assembly,
      rendering: undefined,
      committedRendering: undefined,
      admittedAssembly: admitted,
      committedAssemblyDisplay: display,
      entryPath: 'scene.json',
      publishedAssemblyEntryPath: 'scene.json',
      latestRenderingOutcome: outcome,
    },
  });
  vi.mocked(actor.getSnapshot).mockReturnValue(cadSnapshot);
  vi.mocked(actor.subscribe).mockReturnValue({ unsubscribe: vi.fn() });
  const kinematics = mock<ActorRefFrom<typeof kinematicsMachine>>();
  const unit = mock<KinematicsUnitState>();
  Object.assign(unit, { coordinates: {}, revision: 1 });
  const kinematicsSnapshot = mock<SnapshotFrom<typeof kinematicsMachine>>();
  Object.assign(kinematicsSnapshot, { context: { revision: 1, unitsById: { model: unit } } });
  vi.mocked(kinematics.getSnapshot).mockReturnValue(kinematicsSnapshot);
  vi.mocked(kinematics.subscribe).mockReturnValue({ unsubscribe: vi.fn() });
  const graphics = mock<ActorRefFrom<typeof graphicsMachine>>();
  const graphicsSnapshot = mock<SnapshotFrom<typeof graphicsMachine>>();
  Object.assign(graphicsSnapshot, {
    context: {
      gltfPresentation: { presentedKey: root.digest, phase: 'presented' },
      kinematicsRef: kinematics,
      modelInteractionUnitId: 'model',
    },
  });
  vi.mocked(graphics.getSnapshot).mockReturnValue(graphicsSnapshot);
  vi.mocked(graphics.subscribe).mockReturnValue({ unsubscribe: vi.fn() });
  return { client, document, actor, graphics, kinematics };
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:fixture') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
});

describe('AR pinned assembly export', () => {
  it('exports the displayed pin through its GLB transcoder route and releases the blob', async () => {
    const { document, actor, graphics } = fixture();
    const { result } = renderHook(() => useAr({ artifact: undefined, cadRef: actor, graphicsRef: graphics }));
    expect(result.current.canActivateAr).toBe(true);
    await act(async () => result.current.activateAr());
    expect(document.exportPublished).toHaveBeenCalledWith({ format: 'usdz', publishedAssembly: { root } });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fixture');
  });
  it('denies a selected-root change during export before opening AR', async () => {
    const { document, actor, graphics } = fixture();
    vi.mocked(document.exportPublished).mockImplementationOnce(async () => {
      const snapshot = actor.getSnapshot();
      vi.mocked(actor.getSnapshot).mockReturnValue({
        ...snapshot,
        context: { ...snapshot.context, entryPath: 'other.json' },
      });
      return {
        success: true,
        exportId: 'ar-export',
        issues: [],
        files: [{ name: 'scene.usdz', mimeType: 'model/vnd.usdz+zip', bytes: new Uint8Array([1]) }],
      };
    });
    const { result } = renderHook(() => useAr({ artifact: undefined, cadRef: actor, graphicsRef: graphics }));
    await act(async () => result.current.activateAr());
    expect(toastError).toHaveBeenCalledWith('The selected assembly changed during AR export.');
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
  it('denies CAD root B while the committed presentation retains A during preparation or failure', async () => {
    // Failed B candidates retain A's key and return to 'presented'; requestedKey still identifies B.
    for (const phase of ['preparing', 'presented'] as const) {
      const { document, actor, graphics } = fixture();
      const snapshot = graphics.getSnapshot();
      vi.mocked(graphics.getSnapshot).mockReturnValue({
        ...snapshot,
        context: {
          ...snapshot.context,
          gltfPresentation: {
            ...snapshot.context.gltfPresentation,
            phase,
            requestedKey: root.digest,
            presentedKey: `sha256:${'1'.repeat(64)}`,
          },
        },
      });
      const { result, unmount } = renderHook(() =>
        useAr({ artifact: undefined, cadRef: actor, graphicsRef: graphics }),
      );
      expect(result.current.canActivateAr).toBe(false);
      // oxlint-disable-next-line eslint/no-await-in-loop -- Each retained-presentation case must settle before unmounting.
      await act(async () => result.current.activateAr());
      expect(document.exportPublished).not.toHaveBeenCalled();
      expect(URL.createObjectURL).not.toHaveBeenCalled();
      unmount();
    }
  });
  it('denies pinned AR without a committed presentation authority', async () => {
    const { document, actor } = fixture();
    const { result } = renderHook(() => useAr({ artifact: undefined, cadRef: actor }));
    expect(result.current.canActivateAr).toBe(false);
    await act(async () => result.current.activateAr());
    expect(document.exportPublished).not.toHaveBeenCalled();
  });
  it('should deny current-view AR for an active pose unsupported by the as-built USDZ route', async () => {
    const { document, actor, graphics, kinematics } = fixture();
    const snapshot = kinematics.getSnapshot();
    vi.mocked(kinematics.getSnapshot).mockReturnValue({
      ...snapshot,
      context: {
        ...snapshot.context,
        unitsById: { model: mock<KinematicsUnitState>({ coordinates: { hinge: 0.5 }, revision: 1 }) },
      },
    });
    const { result } = renderHook(() => useAr({ artifact: undefined, cadRef: actor, graphicsRef: graphics }));
    expect(result.current.canActivateAr).toBe(false);
    await act(async () => result.current.activateAr());
    expect(document.exportPublished).not.toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
  it('should fence pose revision during export even when coordinates return to as-built', async () => {
    const { document, actor, graphics, kinematics } = fixture();
    vi.mocked(document.exportPublished).mockImplementationOnce(async () => {
      const snapshot = kinematics.getSnapshot();
      vi.mocked(kinematics.getSnapshot).mockReturnValue({ ...snapshot, context: { ...snapshot.context, revision: 3 } });
      return {
        success: true,
        exportId: 'ar-export',
        issues: [],
        files: [{ name: 'scene.usdz', mimeType: 'model/vnd.usdz+zip', bytes: new Uint8Array([1]) }],
      };
    });
    const { result } = renderHook(() => useAr({ artifact: undefined, cadRef: actor, graphicsRef: graphics }));
    await act(async () => result.current.activateAr());
    expect(toastError).toHaveBeenCalledWith(
      'The presented pose changed during AR export; USDZ supports the as-built pose only.',
    );
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
  it('denies a presentation change during export before opening AR', async () => {
    const { document, actor, graphics } = fixture();
    vi.mocked(document.exportPublished).mockImplementationOnce(async () => {
      const snapshot = graphics.getSnapshot();
      vi.mocked(graphics.getSnapshot).mockReturnValue({
        ...snapshot,
        context: {
          ...snapshot.context,
          gltfPresentation: { ...snapshot.context.gltfPresentation, presentedKey: `sha256:${'1'.repeat(64)}` },
        },
      });
      return {
        success: true,
        exportId: 'ar-export',
        issues: [],
        files: [{ name: 'scene.usdz', mimeType: 'model/vnd.usdz+zip', bytes: new Uint8Array([1]) }],
      };
    });
    const { result } = renderHook(() => useAr({ artifact: undefined, cadRef: actor, graphicsRef: graphics }));
    await act(async () => result.current.activateAr());
    expect(toastError).toHaveBeenCalledWith('The presented model changed during AR export.');
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
  it('denies stale or failed actor geometry before export', async () => {
    for (const [outcome, hash] of [
      ['failure', root.digest],
      ['success', 'stale'],
    ] as const) {
      const { document, actor, graphics } = fixture(outcome, hash);
      const { result, unmount } = renderHook(() =>
        useAr({ artifact: undefined, cadRef: actor, graphicsRef: graphics }),
      );
      expect(result.current.canActivateAr).toBe(false);
      // oxlint-disable-next-line eslint/no-await-in-loop -- Each hook instance must settle before unmounting.
      await act(async () => result.current.activateAr());
      expect(document.exportPublished).not.toHaveBeenCalled();
      unmount();
    }
  });
});
