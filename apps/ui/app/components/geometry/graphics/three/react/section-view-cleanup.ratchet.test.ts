import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const graphicsThreeRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function listTypeScriptFilesRecursively(directory: string): string[] {
  const entries = readdirSync(directory, { withFileTypes: true });
  const output: string[] = [];

  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      output.push(...listTypeScriptFilesRecursively(fullPath));
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      output.push(fullPath);
    }
  }

  return output;
}

describe('Section view stencil / manifold cleanup ratchet', () => {
  it('never reintroduces deleted stencil-cap symbols under graphics/three', () => {
    const needles = [
      'isClosedManifold',
      'collectStencilCapTargets',
      'SectionStencilProxies',
      'SectionCapPlane',
      'useSectionCapManifoldSources',
      'cappingMaterialRef',
      'IncrementWrapStencilOp',
      'DecrementWrapStencilOp',
      'NotEqualStencilFunc',
      'AlwaysStencilFunc',
      'ReplaceStencilOp',
    ] as const;

    const files = listTypeScriptFilesRecursively(graphicsThreeRoot);
    const offenders: Array<{ needle: string; file: string }> = [];

    for (const filePath of files) {
      /* Exempt ratchet meta-test from scanning itself via filename match */
      if (filePath.endsWith('section-view-cleanup.ratchet.test.ts')) {
        continue;
      }

      const source = readFileSync(filePath, 'utf8');
      for (const needle of needles) {
        if (source.includes(needle)) {
          offenders.push({ needle, file: filePath });
        }
      }
    }

    expect(offenders, JSON.stringify(offenders, undefined, 2)).toHaveLength(0);
  });

  it('does not substring-match `clearStencil` / `stencilWrite` identifiers in shaders or materials here', () => {
    /* Full-word style scan: disallow these exact identifiers appearing as tokens. */
    const bannedIdentifiers = ['clearStencil', 'stencilWrite'] as const;
    const files = listTypeScriptFilesRecursively(graphicsThreeRoot).filter(
      (path) => !path.endsWith('section-view-cleanup.ratchet.test.ts'),
    );

    const rxById: Record<(typeof bannedIdentifiers)[number], RegExp> = {
      clearStencil: /\bclearStencil\b/,
      stencilWrite: /\bstencilWrite\b/,
    };

    const offenders: Array<{ needle: string; file: string }> = [];

    for (const filePath of files) {
      const source = readFileSync(filePath, 'utf8');
      for (const id of bannedIdentifiers) {
        if (rxById[id].test(source)) {
          offenders.push({ needle: id, file: filePath });
        }
      }
    }

    expect(offenders, JSON.stringify(offenders, undefined, 2)).toHaveLength(0);
  });

  it('flags bare `cappingMaterial` usages if reintroduced (except this test string)', () => {
    const files = listTypeScriptFilesRecursively(graphicsThreeRoot).filter((p) => !p.includes('.test.'));
    const rx = /\bcappingMaterial\b/;
    const offenders: string[] = [];

    for (const filePath of files) {
      const source = readFileSync(filePath, 'utf8');
      if (rx.test(source)) {
        offenders.push(filePath);
      }
    }

    expect(offenders, offenders.join('\n')).toHaveLength(0);
  });
});
