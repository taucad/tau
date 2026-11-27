import { expectTypeOf } from 'vitest';
import type { ExpandPluginKernels, ExpandPluginTranscoders } from '@taucad/runtime/plugin';

import { plugin, cadmpeg, cadmpegKernel, cadmpegTranscoder } from '#index.js';
import type { CadmpegEngines, CadmpegOptions } from '#index.js';

const selected = plugin();
const all = plugin({ preset: 'all' });

expectTypeOf<ExpandPluginKernels<readonly [typeof selected]>>().toEqualTypeOf<
  readonly [ReturnType<typeof cadmpegKernel>]
>();

expectTypeOf<ExpandPluginTranscoders<readonly [typeof all]>>().toEqualTypeOf<
  readonly [ReturnType<typeof cadmpegTranscoder>]
>();

expectTypeOf(cadmpeg).toEqualTypeOf(plugin);

// A browser host states where the engines are; the installed cadmpeg-ts states what they are.
const engines = { baseUrl: 'https://dependencies.tau.new/', layout: 'digest' } as const;
cadmpeg({ kernels: { import: { engines } } });
cadmpeg({ preset: 'all', kernels: { import: { engines } }, transcoders: { export: { engines } } });
cadmpeg({ kernels: { import: { engines: { baseUrl: '/cadmpeg-ts/', layout: 'package' } } } });
// Node.js hosts (desktop, the CLI) need no option.
cadmpeg();
expectTypeOf<CadmpegEngines>().toEqualTypeOf<{ baseUrl: string; layout: 'digest' | 'package' }>();
expectTypeOf<CadmpegOptions>().toEqualTypeOf<{ engines?: CadmpegEngines | undefined }>();

// @ts-expect-error -- two layouts only; the digests always come from the installed package.
cadmpegKernel({ engines: { baseUrl: '/', layout: 'raw' } });
// @ts-expect-error -- no digest or manifest is passed in: the identity is not the host's to state.
cadmpegKernel({ engines: { ...engines, sha256: 'a'.repeat(64) } });
// @ts-expect-error -- `assets` is PicoGK's option, not this one.
cadmpegTranscoder({ assets: { url: '/', sha256: 'a'.repeat(64) } });
