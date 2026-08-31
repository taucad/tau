import { defineRuntime } from '@taucad/runtime/worker';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { openrscad } from '@taucad/openrscad';
import { parameterCache, geometryCache, gltfEdgeDetection } from '@taucad/middleware';
import { esbuild } from '@taucad/esbuild';
import { assimp } from '@taucad/assimp';
import qrcodeScad from '#routes/_index/qrcode.scad?raw';
import { KernelDemo } from '#routes/_index/demo/kernel-demo.js';
import type { Units } from '#components/geometry/parameters/rjsf-context.js';

const qrMainFile = 'main.scad';

// OpenRSCAD (WASM) lives on the secondary tab only. This module is imported
// lazily by the demo section, so the WASM kernel never enters the default chunk.
const qrRuntime = defineRuntime({
  plugins: [assimp(), openrscad(), esbuild()],
  middleware: [parameterCache(), geometryCache(), gltfEdgeDetection()],
});

const qrClientOptions = {
  runtime: qrRuntime,
  transport: inProcessTransport({ runtime: qrRuntime, fileSystem: fromMemoryFs() }),
};

const qrUnits: Units = { length: { sourceSymbol: 'mm', displaySymbol: 'mm' } };

export function QrDemo(): React.JSX.Element {
  return (
    <KernelDemo
      clientOptions={qrClientOptions}
      files={{ [qrMainFile]: qrcodeScad }}
      mainFile={qrMainFile}
      units={qrUnits}
      exportName='qrcode'
      project={{
        name: 'QR Code Generator',
        description: 'A parametric QR code generator built with OpenSCAD',
        tags: ['openscad', 'parametric', 'qr-code'],
        forkedFrom: 'demo-qrcode',
      }}
      note='Scan the QR code with your phone!'
    />
  );
}
