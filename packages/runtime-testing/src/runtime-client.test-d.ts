import { expectTypeOf, test } from 'vitest';
import { createTestGeometry, createTestRuntimeClient } from '@taucad/runtime-testing';
import type { Rendering, RuntimeClient } from '@taucad/runtime/client';
import type { RuntimeDefinition } from '@taucad/runtime/worker';
import type { BundlerPlugin, KernelPlugin, MiddlewarePlugin, TranscoderPlugin } from '@taucad/runtime';
import { defineKernel } from '@taucad/runtime/kernel';
import { defineRuntime } from '@taucad/runtime/worker';
import { z } from 'zod';

type ExactRuntime = RuntimeDefinition<
  readonly KernelPlugin[],
  readonly MiddlewarePlugin[],
  readonly BundlerPlugin[],
  readonly [TranscoderPlugin<{ readonly png: { readonly quality: number } }, 'svg', 'image'>]
>;

declare const runtime: ExactRuntime;
type RequiredKernel = KernelPlugin<
  Record<never, never>,
  Record<string, unknown>,
  'required',
  'includeEdges',
  Record<never, never>,
  readonly ['cad'],
  z.ZodObject<{ quality: z.ZodNumber }>,
  { model: { title: 'Model'; mimeType: 'model/gltf-binary' } },
  Record<never, never>
>;
declare const requiredRuntime: RuntimeDefinition<readonly [RequiredKernel]>;
const realKernel = defineKernel({
  id: 'fixture-views',
  name: 'Fixture views',
  version: '1.0.0',
  extensions: ['cad'],
  evaluateOptionsSchema: z.object({ precision: z.number() }),
  views: {
    preview: { title: 'Preview', mimeType: 'image/svg+xml' },
    diagram: { title: 'Diagram', mimeType: 'image/svg+xml', optionsSchema: z.object({ scale: z.number() }) },
  },
  exports: {},
  async initialize() {
    return {};
  },
  async resolve() {
    return { resolved: [], unresolved: [] };
  },
  async describe() {
    return { success: false, issues: [] };
  },
  async evaluate() {
    return { handle: {} };
  },
  async render() {
    return { content: '<svg/>' };
  },
});
const realRuntime = defineRuntime({ kernels: [realKernel()] });

test('test client retains exact public routes and supports dynamic client assignment', () => {
  const client = createTestRuntimeClient({ runtime });
  const dynamic: RuntimeClient = client;
  expectTypeOf(dynamic).toEqualTypeOf<RuntimeClient>();
  void client.transcode({ from: 'svg', to: 'png', files: [], options: { quality: 80 } });
  // @ts-expect-error The helper must preserve the selected runtime's route set.
  void client.transcode({ from: 'glb', to: 'png', files: [], options: { quality: 80 } });
  // @ts-expect-error The helper must preserve the selected route's option types.
  void client.transcode({ from: 'svg', to: 'png', files: [], options: { quality: 'high' } });
});

test('geometry fixture preserves required evaluation options and named view routes', () => {
  void createTestGeometry({
    runtime: requiredRuntime,
    open: { source: { path: 'main.cad' }, evaluateOptions: { quality: 4 } },
    view: (document) => document.view('model'),
  });
  void createTestGeometry({
    runtime: requiredRuntime,
    // @ts-expect-error Required evaluate options cannot disappear through the fixture helper.
    open: { source: { path: 'main.cad' } },
  });
  type RequiredOpen = Parameters<ReturnType<typeof createTestRuntimeClient<typeof requiredRuntime>>['open']>[0];
  expectTypeOf<{ source: { path: string }; evaluateOptions: { quality: string } }>().not.toExtend<RequiredOpen>();
  void createTestGeometry({
    runtime: requiredRuntime,
    open: { source: { path: 'main.cad' }, evaluateOptions: { quality: 4 } },
    // @ts-expect-error The fixture only exposes this kernel's model view.
    view: (document) => document.view('drawing'),
  });
});

test('geometry fixture projects real finite kernel views and transformed secondary options', () => {
  const defaultView = createTestGeometry({
    runtime: realRuntime,
    open: { source: { path: 'main.cad' }, evaluateOptions: { precision: 0.5 } },
    view: (document) => document.view('preview'),
  });
  expectTypeOf<Awaited<typeof defaultView>>().toExtend<Rendering<'preview'>>();

  const secondary = createTestGeometry({
    runtime: realRuntime,
    open: { source: { path: 'main.cad' }, evaluateOptions: { precision: 0.5 } },
    view: (document) => document.view('diagram', { options: { scale: 2 } }),
  });
  expectTypeOf<Awaited<typeof secondary>>().toExtend<Rendering<'diagram'>>();

  void createTestGeometry({
    runtime: realRuntime,
    open: { source: { path: 'main.cad' }, evaluateOptions: { precision: 0.5 } },
    // @ts-expect-error Diagram options require a scale.
    view: (document) => document.view('diagram'),
  });
  void createTestGeometry({
    runtime: realRuntime,
    open: { source: { path: 'main.cad' }, evaluateOptions: { precision: 0.5 } },
    // @ts-expect-error Preview has no scale option.
    view: (document) => document.view('preview', { options: { scale: 2 } }),
  });
});
