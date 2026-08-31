// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';
import {
  shaderEvidence,
  shaderRiskCapabilities,
  shaderSites,
} from '#components/geometry/graphics/three/shader-policy.js';

const repositoryRoot = existsSync(join(process.cwd(), 'apps', 'ui'))
  ? process.cwd()
  : resolve(process.cwd(), '..', '..');
const appRoot = join(repositoryRoot, 'apps', 'ui', 'app');
const productionRoots = [join(appRoot, 'components', 'geometry')];

const productionFiles = productionRoots.flatMap((root) => {
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) {
        if (entry !== '__shader-snapshots__') {
          visit(path);
        }
      } else if (/\.(?:ts|tsx)$/.test(entry) && !/\.test\.(?:ts|tsx)$/.test(entry)) {
        files.push(path);
      }
    }
  };
  visit(root);
  return files;
});

const aliasFor = (path: string): string => `#${relative(appRoot, path).replaceAll('\\', '/')}`;
const registeredModules = shaderSites.flatMap(({ modules }) => [...modules]);
const discoveredControlModules = new Set<string>();
const rawShaderModules = new Set<string>();
const customConstructors = new Set([
  'ShaderMaterial',
  'MeshBasicNodeMaterial',
  'PointsNodeMaterial',
  'NodeMaterial',
  'ThreeRenderPipeline',
  'EffectComposer',
  'N8AOPostPass',
]);
const controlAssignments = new Set(['onBeforeCompile', 'colorNode', 'positionNode', 'depthNode', 'outputNode']);

for (const path of productionFiles) {
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
  const visit = (node: ts.Node): void => {
    if (ts.isNewExpression(node)) {
      const name = ts.isPropertyAccessExpression(node.expression)
        ? node.expression.name.text
        : node.expression.getText(source);
      if (customConstructors.has(name)) {
        discoveredControlModules.add(aliasFor(path));
      }
      if (name === 'RawShaderMaterial') {
        rawShaderModules.add(aliasFor(path));
      }
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const { left } = node;
      if (ts.isPropertyAccessExpression(left) && controlAssignments.has(left.name.text)) {
        discoveredControlModules.add(aliasFor(path));
      }
    }
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      (node.expression.text === 'wgslFn' || node.expression.text === 'glslFn')
    ) {
      rawShaderModules.add(aliasFor(path));
    }
    if (ts.isClassDeclaration(node)) {
      const base =
        node.heritageClauses?.flatMap(({ types }) => types.map(({ expression }) => expression.getText(source))) ?? [];
      if (base.includes('Pass') || base.includes('ThreeLine2NodeMaterial')) {
        discoveredControlModules.add(aliasFor(path));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

describe('shader policy inventory', () => {
  it('registers every AST-discovered custom shader/pass module exactly once', () => {
    expect(new Set(registeredModules).size).toBe(registeredModules.length);
    expect([...discoveredControlModules].sort()).toEqual(
      registeredModules.filter((module) => module !== '#components/geometry/graphics/three/scene-overlay.tsx').sort(),
    );
  });

  it('resolves every registered module', () => {
    for (const module of registeredModules) {
      expect(existsSync(join(appRoot, module.slice(1)))).toBe(true);
    }
  });

  it('maps every declared risk to named, existing test evidence', () => {
    for (const site of shaderSites) {
      const required = new Set(site.risks.flatMap((risk) => shaderRiskCapabilities[risk]));
      const siteEvidence = shaderEvidence[site.id];
      for (const capability of required) {
        const records = siteEvidence[capability];
        expect(records, `${site.id} lacks ${capability}`).toBeDefined();
        for (const record of records) {
          const separator = record.indexOf('::');
          const path = join(repositoryRoot, record.slice(0, separator));
          const testName = record.slice(separator + 2);
          expect(existsSync(path), record).toBe(true);
          expect(readFileSync(path, 'utf8'), record).toContain(testName);
        }
      }
      if (site.backends.length > 1) {
        expect(siteEvidence['backend-differential']).toBeDefined();
      }
    }
  });

  it('has no unreviewed raw WGSL/GLSL escape site', () => {
    expect([...rawShaderModules]).toEqual([]);
  });
});
