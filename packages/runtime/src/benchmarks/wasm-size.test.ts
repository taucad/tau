import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const runtimeRoot = resolve(import.meta.dirname, '../..');

type WasmBudget = {
  path: string;
  maxMb: number;
};

const wasmBudgets: WasmBudget[] = [
  { path: 'src/kernels/replicad/wasm/replicad_single.wasm', maxMb: 25 },
  { path: 'src/kernels/replicad/wasm/replicad_multi.wasm', maxMb: 25 },
  { path: 'src/kernels/opencascade/wasm/opencascade_full.wasm', maxMb: 120 },
  { path: 'src/kernels/manifold/wasm/manifold.wasm', maxMb: 1 },
  { path: 'src/kernels/zoo/wasm/kcl_wasm_lib_bg.wasm', maxMb: 17 },
];

describe('WASM binary size budgets', () => {
  for (const { path: wasmPath, maxMb } of wasmBudgets) {
    const name = wasmPath.split('/').pop()!;

    it(`${name} is within budget (${maxMb} MB)`, () => {
      const fullPath = resolve(runtimeRoot, wasmPath);
      if (!existsSync(fullPath)) {
        console.log(`  [skip] ${name} not found (assets not copied)`);
        return;
      }

      const { size } = statSync(fullPath);
      const sizeMb = size / (1024 * 1024);
      const maxBytes = maxMb * 1024 * 1024;

      console.log(`  ${name}: ${sizeMb.toFixed(2)} MB (budget: ${maxMb} MB)`);
      expect(size).toBeLessThanOrEqual(maxBytes);
    });
  }

  it('prints size report', () => {
    const rows: string[] = [];
    let totalBytes = 0;

    for (const { path: wasmPath, maxMb } of wasmBudgets) {
      const fullPath = resolve(runtimeRoot, wasmPath);
      if (!existsSync(fullPath)) {
        continue;
      }

      const { size } = statSync(fullPath);
      totalBytes += size;
      const sizeMb = size / (1024 * 1024);
      const utilization = ((sizeMb / maxMb) * 100).toFixed(0);
      rows.push(`| ${wasmPath.split('/').pop()} | ${sizeMb.toFixed(2)} MB | ${maxMb} MB | ${utilization}% |`);
    }

    if (rows.length === 0) {
      console.log('  [skip] No WASM artifacts found');
      return;
    }

    console.log('\n--- WASM Size Report ---');
    console.log('| Artifact | Size | Budget | Utilization |');
    console.log('|----------|------|--------|-------------|');
    for (const row of rows) {
      console.log(row);
    }
    console.log(`\nTotal WASM: ${(totalBytes / (1024 * 1024)).toFixed(2)} MB`);
  });
});
