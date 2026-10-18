/**
 * Test fixture: an in-memory runtime for the host tool registry. Its one document evaluates to a single
 * GLB view, renders a header-only GLB and exports one WebP file, so the CAD tools run without a kernel.
 * Tests only.
 */

// eslint-disable-next-line import-x/no-extraneous-dependencies -- Test-only fixture, never bundled: it runs on the workspace's Vitest.
import { vi } from 'vitest';

import type {
  Description,
  Evaluation,
  ExportResult,
  Rendering,
  RuntimeDocument,
  ViewSubscription,
  WideViewRequest,
} from '@taucad/runtime/client';

import type { HostExportFile, HostRuntimeClient } from '#agent-tools.js';

/**
 * A WebP-typed export file with placeholder bytes.
 *
 * @param name - The file name.
 * @returns The export file.
 */
export const webpFile = (name: string): HostExportFile => ({
  name,
  mimeType: 'image/webp',
  bytes: new Uint8Array([1, 2, 3]),
});

const glb = (): Uint8Array<ArrayBuffer> => {
  const content = new Uint8Array(12);
  const header = new DataView(content.buffer);
  header.setUint32(0, 0x46_54_6c_67, true);
  header.setUint32(4, 2, true);
  header.setUint32(8, content.byteLength, true);
  return content;
};

const fakeView = (current: () => Rendering): ViewSubscription => ({
  view: 'model',
  request: {},
  rendering: vi.fn(async () => ({ superseded: false, rendering: current() })),
  update: vi.fn(async () => ({ superseded: false, rendering: current() })),
  on: vi.fn(() => () => undefined),
  close: vi.fn(),
});

/**
 * A document whose evaluation offers one GLB view and whose export yields one WebP file.
 *
 * @param overrides - Replacement evaluation or export, and the rendering its views return.
 * @returns The document.
 */
export const fakeDocument = (
  overrides: Partial<Pick<RuntimeDocument, 'evaluation' | 'export'>> & { rendering?: () => Rendering } = {},
): RuntimeDocument => {
  const content = glb();
  const evaluation: Evaluation = {
    id: 'evaluation',
    success: true,
    transient: false,
    views: [{ id: 'model', title: 'Model', mimeType: 'model/gltf-binary' }],
    exports: [],
    issues: [],
  };
  const rendering: Rendering = {
    success: true,
    requestId: 'rendering',
    evaluationId: evaluation.id,
    transient: false,
    view: 'model',
    artifact: { mimeType: 'model/gltf-binary', content },
    hash: 'geometry',
    issues: [],
  };
  const viewSpy = vi.fn((_id?: string, _request?: WideViewRequest) =>
    fakeView(overrides.rendering ?? (() => rendering)),
  );
  function documentView(): ViewSubscription<string, Readonly<{ options?: never; instance?: never; content?: never }>>;
  function documentView<Id extends string>(id: Id, request?: WideViewRequest): ViewSubscription<Id>;
  function documentView(id?: string, request?: WideViewRequest): ViewSubscription {
    return viewSpy(id, request);
  }
  return {
    id: 'document',
    evaluation: vi.fn(async () => ({ superseded: false, evaluation })),
    update: vi.fn(async () => ({ superseded: false, evaluation })),
    view: documentView,
    export: vi.fn<RuntimeDocument['export']>(
      async (): Promise<ExportResult> => ({
        success: true,
        exportId: 'glb',
        evaluationId: evaluation.id,
        files: [webpFile('render.webp')],
        issues: [],
      }),
    ),
    on: vi.fn(() => () => undefined),
    close: vi.fn(),
    ...overrides,
  };
};

/**
 * A runtime that opens {@link fakeDocument} and transcodes every image to one WebP file.
 *
 * @param overrides - Members that replace the defaults.
 * @returns The runtime client.
 */
export const fakeRuntime = (overrides: Partial<HostRuntimeClient> = {}): HostRuntimeClient => {
  const base: HostRuntimeClient = {
    connect: vi.fn(async () => undefined),
    capabilities: undefined,
    open: vi.fn(() => fakeDocument()),
    describe: vi.fn(async (): Promise<Description> => ({ success: false, kernelId: undefined, issues: [] })),
    transcode: vi.fn<HostRuntimeClient['transcode']>(async () => ({
      success: true,
      data: [webpFile('render.webp')],
      issues: [],
    })),
  };
  return { ...base, ...overrides };
};
