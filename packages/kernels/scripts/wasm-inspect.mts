/* eslint-disable complexity -- refactor if needed */
/* eslint-disable n/prefer-global/process -- CLI script requires direct process access */
/* eslint-disable unicorn/no-process-exit -- CLI script uses process.exit for error codes */
/**
 * WASM Binary Inspection Tool
 *
 * Analyzes a WASM binary to report on:
 *   - Section sizes (code, data, custom, etc.)
 *   - Function count and size distribution
 *   - Categorized size breakdown by OCCT toolkit/module
 *   - Top largest functions
 *   - Pathological bloat detection (oversized DynamicType, destructors)
 *
 * Requires: wabt (wasm-objdump) installed
 *
 * Run with: pnpm nx wasm-inspect kernels
 *   Options:
 *     --wasm <path>       Path to .wasm file (default: auto-detect replicad_single.wasm)
 *     --symbols <path>    Path to .symbols file from --emit-symbol-map
 *     --output <path>     Directory for output reports (default: reports)
 *     --json              Also output JSON report
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    wasm: { type: 'string', short: 'w' },
    symbols: { type: 'string', short: 's' },
    output: { type: 'string', short: 'o', default: 'reports' },
    json: { type: 'boolean', default: false },
  },
  strict: true,
});

const wasmDir = resolve('src/kernels/replicad/wasm');
const symbolsDir = resolve('../../repos/replicad/packages/replicad-opencascadejs');

function findWasmFile(): string {
  if (values.wasm) {
    return resolve(values.wasm);
  }

  const candidates = [join(wasmDir, 'replicad_single.wasm'), join(symbolsDir, 'replicad_single.wasm')];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  console.error('No WASM file found. Use --wasm <path> to specify one.');
  process.exit(1);
}

function findSymbolsFile(wasmPath: string): string | undefined {
  if (values.symbols) {
    return resolve(values.symbols);
  }

  const base = basename(wasmPath, '.wasm');
  const candidates = [
    join(symbolsDir, `${base}.js.symbols`),
    wasmPath.replace('.wasm', '.js.symbols'),
    wasmPath.replace('.wasm', '.symbols'),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

type SectionInfo = { name: string; size: number; count: number };
type FunctionSize = { index: number; size: number };
type CategoryBreakdown = {
  name: string;
  sizeBytes: number;
  sizeMb: number;
  percent: number;
  functionCount: number;
};

function parseSections(wasmPath: string): SectionInfo[] {
  const output = execSync(`wasm-objdump -h "${wasmPath}"`, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
  const sections: SectionInfo[] = [];

  for (const line of output.split('\n')) {
    const match = /^\s*(\w+)\s+start=0x[\da-f]+\s+end=0x[\da-f]+\s+\(size=0x([\da-f]+)\)\s+count:\s*(\d+)/i.exec(line);
    if (match?.[1] && match[2] && match[3]) {
      sections.push({
        name: match[1],
        size: Number.parseInt(match[2], 16),
        count: Number.parseInt(match[3], 10),
      });
    }
  }

  return sections;
}

function parseFunctionOffsets(wasmPath: string): FunctionSize[] {
  console.log('  Disassembling WASM to extract function offsets (this takes ~20s)...');
  const output = execSync(`wasm-objdump -d "${wasmPath}" | grep '^[0-9a-f]\\+ func\\['`, {
    encoding: 'utf8',
    maxBuffer: 200 * 1024 * 1024,
    shell: '/bin/bash',
  });

  const entries: Array<{ offset: number; index: number }> = [];
  for (const line of output.split('\n')) {
    const match = /^([\da-f]+)\s+func\[(\d+)]/.exec(line);
    if (match?.[1] && match[2]) {
      entries.push({
        offset: Number.parseInt(match[1], 16),
        index: Number.parseInt(match[2], 10),
      });
    }
  }

  const sizes: FunctionSize[] = [];
  for (let i = 0; i < entries.length - 1; i++) {
    const entry = entries[i];
    const nextEntry = entries[i + 1];
    if (!entry || !nextEntry) {
      continue;
    }

    sizes.push({
      index: entry.index,
      size: nextEntry.offset - entry.offset,
    });
  }

  return sizes;
}

function loadSymbolMap(symbolsPath: string): Map<number, string> {
  const map = new Map<number, string>();
  const content = readFileSync(symbolsPath, 'utf8');
  for (const line of content.split('\n')) {
    const idx = line.indexOf(':');
    if (idx > 0) {
      map.set(Number.parseInt(line.slice(0, idx), 10), line.slice(idx + 1).trim());
    }
  }

  return map;
}

function categorizeFunction(name: string): string {
  const prefix = name.split('::')[0]?.split('(')[0]?.split('<')[0]?.trim() ?? '';

  if (/^(_emb|_emv|emscripten|void const\* emscripten|decltype|embind_init)/.test(prefix)) {
    return 'embind/emval';
  }

  if (/^(std|void std)/.test(prefix)) {
    return 'std:: C++ stdlib';
  }

  if (/^(non-virtual thunk to NCollection|NCollection)/.test(prefix)) {
    return 'NCollection templates';
  }

  if (prefix.startsWith('TopOpeBRep')) {
    return 'TopOpeBRep (legacy booleans)';
  }

  if (/^(BOPAlgo|BOPDS|BOPTools|IntTools)/.test(prefix)) {
    return 'BOPAlgo (modern booleans)';
  }

  if (/^(BRepAlgo|BRepBuilder|BRepPrim|BRepOffset|BRepFillet|BRepFeat)/.test(prefix)) {
    return 'BRep modeling API';
  }

  if (
    /^(Geom_|Geom2d|BSplCLib|BSplSLib|TColgp|gp_|GeomAdaptor|Geom2dAdaptor|GeomConvert|GeomAPI|GeomLib|GeomInt|GeomFill|GeomAbs|GeomTools|GeomPlate|Geom2dConvert|Geom2dAPI|Geom2dInt|GCE2d|GC_|GCPnts|ProjLib|Extrema|AppParCurves|AppDef|Approx|Convert)/.test(
      prefix,
    )
  ) {
    return 'Geometry/Curves/Surfaces';
  }

  if (
    /^(STEP|IFSelect|XSControl|Transfer|RWStep|StepData|StepGeom|StepShape|StepBasic|StepRepr|StepAP|StepVisual|StepFEA|StepKinematics|StepDimTol|StepElement|Interface|MoniTool|STEPCAFControl|STEPControl)/.test(
      prefix,
    )
  ) {
    return 'STEP/DataExchange';
  }

  if (/^(XCAF|XCAFDoc|TDocStd|TDF|CDM|TDataStd|TCollection|LDOM|FSD_|PCDM|Storage)/.test(prefix)) {
    return 'XCAF/AppFramework';
  }

  if (/^(ShapeFix|ShapeUpgrade|ShapeAnalysis|ShapeConstruct|ShapeProcess|ShapeBuild|ShapeCustom)/.test(prefix)) {
    return 'ShapeHealing';
  }

  if (/^(BRepMesh|BRepCheck|Poly_|StdPrs|IMeshTools|IMeshData)/.test(prefix)) {
    return 'Meshing/Tessellation';
  }

  if (prefix.startsWith('OSD')) {
    return 'OSD (system/threads)';
  }

  if (/^(HLR|Contap)/.test(prefix)) {
    return 'HLR/Contour';
  }

  if (/^(Adaptor|BRepAdaptor)/.test(prefix)) {
    return 'Adaptors';
  }

  if (/^(ChFi|Blend|BRepBlend|FilletSurf)/.test(prefix)) {
    return 'Fillet/Chamfer internals';
  }

  if (/^(Bnd_|BndLib)/.test(prefix)) {
    return 'Bounding';
  }

  if (/^(TopoDS|TopExp|TopAbs|TopTools|TopLoc)/.test(prefix)) {
    return 'Topology';
  }

  if (/^(BRep_|BRepTools|BRepLib|BRepGProp|BRepExtrema|BRepClass|BRepSweep|BRepTopAdaptor)/.test(prefix)) {
    return 'BRep data/tools';
  }

  if (prefix.startsWith('Law_')) {
    return 'Law functions';
  }

  if (/^(Quantity|Standard|TColStd|Precision|Message|NCollection_Base)/.test(prefix)) {
    return 'Foundation';
  }

  if (/^(math_|math )/.test(prefix)) {
    return 'Math solver';
  }

  if (/^(IntPatch|IntPolyh|IntSurf|Intf|IntCurve|IntAna|IntWalk|IntImp|IntStart|Int2d)/.test(prefix)) {
    return 'Intersection algorithms';
  }

  if (/^(BinMDF|BinDrivers|BinLDrivers|BinObjMgt|StdDrivers|StdLDrivers|StdObjMgt|BinTools)/.test(prefix)) {
    return 'Persistence drivers';
  }

  if (/^(Stl|RWStl)/.test(prefix)) {
    return 'STL format';
  }

  if (/^(IGES|IGESData|IGESGeom)/.test(prefix)) {
    return 'IGES format';
  }

  if (/^(Vrml|VrmlData|VrmlAPI|VrmlConverter|DEVRML)/.test(prefix)) {
    return 'VRML format';
  }

  if (/^(RWGltf|DEGLTF)/.test(prefix)) {
    return 'GLTF format';
  }

  if (/^(RWObj|DEOBJ)/.test(prefix)) {
    return 'OBJ format';
  }

  if (/^(RWPly|DEPLY)/.test(prefix)) {
    return 'PLY format';
  }

  if (/^(__cxa|__assert|abort|dlmalloc|sbrk|__wasm|dynCall)/.test(prefix)) {
    return 'Runtime/malloc';
  }

  if (/^(Graphic3d|Aspect|Prs3d|PrsMgr|V3d|Select|AIS)/.test(prefix)) {
    return 'Visualization';
  }

  if (prefix.startsWith('BRepFill')) {
    return 'BRepFill (sweeps/pipes)';
  }

  if (prefix.startsWith('LocOpe')) {
    return 'LocOpe (local operations)';
  }

  return 'Other';
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${bytes} B`;
}

function generateReport(
  wasmPath: string,
  sections: SectionInfo[],
  funcSizes: FunctionSize[],
  symbols: Map<number, string>,
): Record<string, unknown> {
  const fileSize = statSync(wasmPath).size;
  const totalCode = sections.find((s) => s.name === 'Code')?.size ?? 0;
  const totalData = sections.find((s) => s.name === 'Data')?.size ?? 0;
  const totalFunctions = sections.find((s) => s.name === 'Code')?.count ?? funcSizes.length;

  console.log('\n' + '═'.repeat(80));
  console.log('  WASM BINARY INSPECTION REPORT');
  console.log('═'.repeat(80));
  console.log(`  File: ${basename(wasmPath)}`);
  console.log(`  Total size: ${formatBytes(fileSize)}`);
  console.log(`  Functions: ${totalFunctions.toLocaleString()}`);
  console.log('');

  console.log('─'.repeat(80));
  console.log('  SECTION BREAKDOWN');
  console.log('─'.repeat(80));
  for (const section of sections) {
    const pct = ((section.size / fileSize) * 100).toFixed(1);
    console.log(
      `  ${section.name.padEnd(12)} ${formatBytes(section.size).padStart(12)}  (${pct.padStart(5)}%)  ${section.count} entries`,
    );
  }

  console.log('');

  const categories = new Map<string, { size: number; count: number }>();
  for (const func of funcSizes) {
    const name = symbols.get(func.index) ?? `unknown_${func.index}`;
    const cat = categorizeFunction(name);
    const existing = categories.get(cat) ?? { size: 0, count: 0 };
    existing.size += func.size;
    existing.count += 1;
    categories.set(cat, existing);
  }

  const sortedCategories: CategoryBreakdown[] = [...categories.entries()]
    .map(([name, data]) => ({
      name,
      sizeBytes: data.size,
      sizeMb: data.size / (1024 * 1024),
      percent: totalCode > 0 ? (data.size / totalCode) * 100 : 0,
      functionCount: data.count,
    }))
    .sort((a, b) => b.sizeBytes - a.sizeBytes);

  console.log('─'.repeat(80));
  console.log('  CODE SIZE BY CATEGORY');
  console.log('─'.repeat(80));
  console.log('  ' + 'Category'.padEnd(35) + 'Size'.padStart(10) + 'Pct'.padStart(8) + 'Funcs'.padStart(8));
  console.log('  ' + '─'.repeat(61));
  for (const cat of sortedCategories) {
    if (cat.sizeBytes < 1024) {
      continue;
    }

    console.log(
      '  ' +
        cat.name.padEnd(35) +
        formatBytes(cat.sizeBytes).padStart(10) +
        `${cat.percent.toFixed(1)}%`.padStart(8) +
        cat.functionCount.toString().padStart(8),
    );
  }

  console.log('  ' + '─'.repeat(61));
  console.log(
    '  ' +
      'TOTAL'.padEnd(35) +
      formatBytes(totalCode).padStart(10) +
      '100.0%'.padStart(8) +
      totalFunctions.toString().padStart(8),
  );

  console.log('');
  console.log('─'.repeat(80));
  console.log('  TOP 20 LARGEST FUNCTIONS');
  console.log('─'.repeat(80));
  const topFuncs = [...funcSizes].sort((a, b) => b.size - a.size).slice(0, 20);
  for (const func of topFuncs) {
    const name = symbols.get(func.index) ?? `func[${func.index}]`;
    const truncated = name.length > 70 ? name.slice(0, 67) + '...' : name;
    console.log(`  ${formatBytes(func.size).padStart(10)}  ${truncated}`);
  }

  console.log('');
  console.log('─'.repeat(80));
  console.log('  FUNCTION SIZE DISTRIBUTION');
  console.log('─'.repeat(80));
  const thresholds = [100_000, 50_000, 20_000, 10_000, 5000, 1000, 100];
  for (const threshold of thresholds) {
    const matching = funcSizes.filter((f) => f.size >= threshold);
    const totalSize = matching.reduce((sum, f) => sum + f.size, 0);
    const pct = totalCode > 0 ? ((totalSize / totalCode) * 100).toFixed(1) : '0.0';
    console.log(
      `  >= ${(threshold / 1024).toFixed(0).padStart(4)} KB: ${matching.length.toString().padStart(6)} funcs, ${formatBytes(totalSize).padStart(10)} (${pct.padStart(5)}%)`,
    );
  }

  console.log('');
  console.log('─'.repeat(80));
  console.log('  PATHOLOGICAL BLOAT DETECTION');
  console.log('─'.repeat(80));

  const dynamicTypeFuncs = funcSizes.filter((f) => {
    const name = symbols.get(f.index) ?? '';
    return name.includes('DynamicType');
  });
  const dynamicTypeTotal = dynamicTypeFuncs.reduce((sum, f) => sum + f.size, 0);
  const dynamicTypePct = totalCode > 0 ? ((dynamicTypeTotal / totalCode) * 100).toFixed(1) : '0.0';

  console.log(
    `  DynamicType() functions: ${dynamicTypeFuncs.length}, Total: ${formatBytes(dynamicTypeTotal)} (${dynamicTypePct}%)`,
  );
  const topDynamic = dynamicTypeFuncs.sort((a, b) => b.size - a.size).slice(0, 5);
  for (const func of topDynamic) {
    const name = symbols.get(func.index) ?? 'unknown';
    console.log(`    ${formatBytes(func.size).padStart(10)}  ${name.slice(0, 60)}`);
  }

  console.log('');
  const destructors = funcSizes.filter((f) => {
    const name = symbols.get(f.index) ?? '';
    return name.includes('~');
  });
  const destructorTotal = destructors.reduce((sum, f) => sum + f.size, 0);
  const destructorPct = totalCode > 0 ? ((destructorTotal / totalCode) * 100).toFixed(1) : '0.0';

  console.log(`  Destructors: ${destructors.length}, Total: ${formatBytes(destructorTotal)} (${destructorPct}%)`);
  const topDestructors = destructors.sort((a, b) => b.size - a.size).slice(0, 5);
  for (const func of topDestructors) {
    const name = symbols.get(func.index) ?? 'unknown';
    console.log(`    ${formatBytes(func.size).padStart(10)}  ${name.slice(0, 60)}`);
  }

  console.log('');

  const unnecessaryFormats = new Set(['IGES format', 'VRML format', 'GLTF format', 'OBJ format', 'PLY format']);
  const unnecessarySize = sortedCategories
    .filter((c) => unnecessaryFormats.has(c.name))
    .reduce((sum, c) => sum + c.sizeBytes, 0);

  if (unnecessarySize > 0) {
    console.log('─'.repeat(80));
    console.log('  UNNECESSARY FORMAT CODE DETECTED');
    console.log('─'.repeat(80));
    for (const cat of sortedCategories.filter((c) => unnecessaryFormats.has(c.name))) {
      console.log(`  ${cat.name.padEnd(20)} ${formatBytes(cat.sizeBytes).padStart(10)} (${cat.functionCount} funcs)`);
    }

    console.log(`  Total removable:   ${formatBytes(unnecessarySize).padStart(10)}`);
    console.log('');
  }

  const legacyBooleans = sortedCategories.find((c) => c.name === 'TopOpeBRep (legacy booleans)');
  if (legacyBooleans && legacyBooleans.sizeBytes > 0) {
    console.log('─'.repeat(80));
    console.log('  LEGACY CODE DETECTED');
    console.log('─'.repeat(80));
    console.log(
      `  TopOpeBRep (deprecated boolean engine): ${formatBytes(legacyBooleans.sizeBytes)} (${legacyBooleans.functionCount} funcs)`,
    );
    console.log('  Note: Modern code uses BOPAlgo/BRepAlgoAPI. TopOpeBRep is pulled transitively.');
    console.log('');
  }

  console.log('═'.repeat(80));
  console.log('  SUMMARY');
  console.log('═'.repeat(80));
  console.log(`  WASM file:       ${formatBytes(fileSize)}`);
  console.log(`  Code section:    ${formatBytes(totalCode)} (${((totalCode / fileSize) * 100).toFixed(1)}%)`);
  console.log(`  Data section:    ${formatBytes(totalData)} (${((totalData / fileSize) * 100).toFixed(1)}%)`);
  console.log(`  Functions:       ${totalFunctions.toLocaleString()}`);
  console.log(`  With symbols:    ${symbols.size > 0 ? 'Yes' : 'No'}`);
  console.log('═'.repeat(80));

  return {
    file: basename(wasmPath),
    fileSize,
    sections: sections.map((s) => ({ name: s.name, size: s.size, count: s.count })),
    codeSizeBytes: totalCode,
    dataSizeBytes: totalData,
    functionCount: totalFunctions,
    categories: sortedCategories,
    topFunctions: topFuncs.map((f) => ({
      name: symbols.get(f.index) ?? `func[${f.index}]`,
      size: f.size,
    })),
    pathological: {
      dynamicType: { count: dynamicTypeFuncs.length, totalBytes: dynamicTypeTotal },
      destructors: { count: destructors.length, totalBytes: destructorTotal },
    },
  };
}

async function main(): Promise<void> {
  console.log('WASM Binary Inspector');
  console.log('');

  const wasmPath = findWasmFile();
  console.log(`  WASM: ${wasmPath}`);

  const symbolsPath = findSymbolsFile(wasmPath);
  if (symbolsPath) {
    console.log(`  Symbols: ${symbolsPath}`);
  } else {
    console.log('  Symbols: Not found (rebuild with --emit-symbol-map for named functions)');
  }

  console.log('');
  console.log('  Parsing sections...');
  const sections = parseSections(wasmPath);

  console.log('  Parsing function offsets...');
  const funcSizes = parseFunctionOffsets(wasmPath);

  const symbols = symbolsPath ? loadSymbolMap(symbolsPath) : new Map<number, string>();
  console.log(`  Loaded ${symbols.size} symbol names`);

  const report = generateReport(wasmPath, sections, funcSizes, symbols);

  const outputDir = resolve(values.output ?? 'reports');
  mkdirSync(outputDir, { recursive: true });

  if (values.json) {
    const jsonPath = join(outputDir, `wasm-inspect-${new Date().toISOString().replaceAll(/[:.]/g, '-')}.json`);
    writeFileSync(jsonPath, JSON.stringify(report, undefined, 2));
    console.log(`\nJSON report: ${jsonPath}`);
  }
}

try {
  await main();
} catch (error: unknown) {
  console.error('Fatal error:', error);
  process.exit(1);
}
