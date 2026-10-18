// Representative closure rows for each roster package: the files a launch maps to options. Keyed by package, so a
// kernel added to the roster fails to typecheck here until its fixture exists.
import type { ClosureLaunch, ReceiptFile } from '@taucad/runtime/preparation/node';

import type { NativePackage } from '#adopters.js';

const closurePaths: Readonly<Record<NativePackage, readonly string[]>> = {
  '@taucad/build123d': [
    'python/bin/python3',
    'python/lib/python3.12/os.py',
    'tau-worker/worker.py',
    'tau-worker/native_materials.py',
    'tau-worker/mechanisms.py',
    'tau-worker/tau_kernel/analyzer.py',
    'tau-worker/tau_kernel/glb.py',
    'tau-worker/tau_kernel/model.py',
    'tau-worker/tau_kernel/protocol.py',
  ],
  '@taucad/picogk': [
    'dotnet/dotnet',
    'dotnet/host/fxr/10.0.11/libhostfxr.dylib',
    'dotnet/shared/Microsoft.NETCore.App/10.0.11/libhostpolicy.dylib',
    'dotnet/shared/Microsoft.NETCore.App/10.0.11/libcoreclr.dylib',
    'tau-worker/Tau.PicoGK.Worker.dll',
    'tau-worker/PicoGK.dll',
    'tau-worker/picogk.26.2.dylib',
  ],
};

const row = (path: string, index: number): ReceiptFile => ({
  path,
  byteLength: 1,
  sha256: index.toString(16).padStart(64, '0'),
  mode: 0o644,
});

/**
 * A sealed closure of a roster package at a store root, as a launch index lists it.
 * @param packageName - Whose representative files the closure holds.
 * @param root - Where the closure is sealed.
 * @returns The launch view, one row per file.
 */
export const fixtureClosure = (packageName: NativePackage, root: string): ClosureLaunch => ({
  package: packageName,
  dependency: 'engine',
  root,
  closureIntegrity: `sha256-${'A'.repeat(43)}=`,
  files: closurePaths[packageName].map(row),
});
