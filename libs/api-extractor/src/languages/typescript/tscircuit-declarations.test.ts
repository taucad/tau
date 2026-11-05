// @vitest-environment node
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { kernelTypePackageMaps, tscircuitTypes } from '#kernel-types.js';

/** The editor's mount: `/node_modules/<package>/` holding each bundle's `index.d.ts`, files and manifest. */
const mountedFiles = (): Map<string, string> => {
  const files = new Map<string, string>();
  for (const [packageName, bundle] of Object.entries(tscircuitTypes)) {
    const root = `/node_modules/${packageName}`;
    files.set(`${root}/index.d.ts`, bundle.content);
    for (const [path, content] of Object.entries(bundle.files ?? {})) {
      files.set(`${root}/${path}`, content);
    }
    files.set(`${root}/package.json`, JSON.stringify(bundle.packageJson ?? { name: packageName, types: 'index.d.ts' }));
  }
  return files;
};

/**
 * Type-check TSX the way the editor's TypeScript worker does: automatic JSX, bundler
 * resolution, and every mounted declaration admitted as a root file.
 */
const diagnose = (source: string): string[] => {
  const files = mountedFiles();
  files.set('/main.tsx', source);
  const options: ts.CompilerOptions = {
    allowUmdGlobalAccess: true,
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
    target: ts.ScriptTarget.ESNext,
    types: [],
  };
  const host = ts.createCompilerHost(options);
  const defaultLibraryDirectory = host.getDefaultLibLocation?.() ?? '';
  host.fileExists = (path) => files.has(path) || (path.startsWith(defaultLibraryDirectory) && ts.sys.fileExists(path));
  host.readFile = (path) =>
    files.get(path) ?? (path.startsWith(defaultLibraryDirectory) ? ts.sys.readFile(path) : undefined);
  host.directoryExists = (path) => path.startsWith('/node_modules') || ts.sys.directoryExists(path);
  host.getCurrentDirectory = () => '/';
  const original = host.getSourceFile.bind(host);
  host.getSourceFile = (path, languageVersion) => {
    const text = files.get(path);
    return text === undefined
      ? original(path, languageVersion)
      : ts.createSourceFile(path, text, languageVersion, true);
  };
  const roots = [...files.keys()].filter((path) => path.endsWith('.d.ts') || path === '/main.tsx');
  const program = ts.createProgram(roots, options, host);
  return ts
    .getPreEmitDiagnostics(program)
    .map(
      (diagnostic) =>
        `${diagnostic.file?.fileName ?? ''}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`,
    );
};

describe('tscircuit editor declarations', () => {
  it('should mount React, csstype and the three tscircuit packages', () => {
    expect(kernelTypePackageMaps).toContain(tscircuitTypes);
    expect(Object.keys(tscircuitTypes).sort()).toEqual(
      ['@tscircuit/core', '@tscircuit/props', 'csstype', 'react', 'tscircuit'].sort(),
    );
    expect(tscircuitTypes['react']?.files).toHaveProperty(['jsx-runtime.d.ts']);
  });

  it('should type a tscircuit board without importing React or tscircuit', () => {
    expect(
      diagnose(`export default () => (
  <board width='50mm' height='35mm' layers={2} thickness='1.6mm'>
    {/* High-current nets */}
    <net name='VIN' isPowerNet nominalTraceWidth='0.8mm' />
    <net name='GND' isGroundNet />
    <pinheader
      name='J1'
      pinCount={2}
      pitch='5.08mm'
      footprint='pinrow2_p5.08mm_id1.3mm_od2.4mm'
      pinLabels={['VIN', 'GND']}
      pcbX={-20.5}
      pcbRotation={90}
      connections={{ VIN: 'net.VIN', GND: 'net.GND' }}
    />
    <capacitor name='C1' capacitance='10uF' maxVoltageRating='50V' footprint='1210' schOrientation='vertical' connections={{ pin1: 'net.VIN', pin2: 'net.GND' }} />
    <resistor name='R1' resistance='10k' footprint='0402' />
    <chip name='U1' footprint='soic8' pinLabels={{ pin1: 'VCC' }} />
    <switch name='SW1' />
    <trace from='.R1 > .pin1' to='net.GND' />
  </board>
);
`),
    ).toEqual([]);
  });

  it('should resolve core helpers, props types and the React global', () => {
    expect(
      diagnose(`import { useResistor } from 'tscircuit';
import type { ResistorProps } from '@tscircuit/props';
const R = useResistor('R1', { resistance: '1k', footprint: '0402' });
const props: ResistorProps = { name: 'R2', resistance: 100 };
export default () => {
  const [x] = React.useState(1);
  return <board width='10mm' height='10mm'><R pcbX={x} /><resistor {...props} /></board>;
};
`),
    ).toEqual([]);
  });

  it('should still report a misspelled or mistyped prop', () => {
    const diagnostics = diagnose(
      "export default () => <board widthh='1mm'><resistor name='R1' resistance={{}} /></board>;\n",
    );
    expect(diagnostics.some((message) => message.includes("Property 'widthh' does not exist"))).toBe(true);
    expect(diagnostics.some((message) => message.includes("'{}' is not assignable"))).toBe(true);
  });
});
