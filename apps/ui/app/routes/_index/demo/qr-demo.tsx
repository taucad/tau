import qrcodeScad from '#routes/_index/qrcode.scad?raw';
import { KernelDemo } from '#routes/_index/demo/kernel-demo.js';
import type { Units } from '#components/geometry/parameters/rjsf-context.js';
import { qrClientOptions } from '#runtime/demo-client-options.js';

const qrMainFile = 'main.scad';

// OpenRSCAD (WASM) lives on the secondary tab only. This module is imported
// lazily by the demo section, so the WASM kernel never enters the default chunk.
const qrUnits: Units = { length: { displaySymbol: 'mm' } };

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
