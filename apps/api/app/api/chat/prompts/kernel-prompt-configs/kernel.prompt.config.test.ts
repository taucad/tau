import type { KernelProvider } from '@taucad/runtime';
import { jscadModelingTypes, replicadTypes } from '@taucad/api-extractor/kernel-types';
import { describe, expect, it } from 'vitest';
import {
  formatAddTopLevelExportRecovery,
  getKernelConfig,
} from '#api/chat/prompts/kernel-prompt-configs/kernel.prompt.config.js';

const allKernels: readonly KernelProvider[] = ['openscad', 'replicad', 'jscad', 'manifold', 'opencascadejs', 'zoo'];

describe('KernelConfig raw declaration prompts', () => {
  it('should preserve JSCAD root and subpath declarations in the prompt', () => {
    const rootDeclarations = jscadModelingTypes['@jscad/modeling'];
    const colorDeclarations = jscadModelingTypes['@jscad/modeling/colors'];
    if (rootDeclarations === undefined || colorDeclarations === undefined) {
      throw new TypeError('Generated JSCAD declaration maps are incomplete.');
    }

    const { codeStandards } = getKernelConfig('jscad');
    expect(codeStandards).toContain(rootDeclarations);
    expect(codeStandards).toContain(colorDeclarations);
  });

  it('should preserve raw Replicad declarations in the prompt', () => {
    const declarations = replicadTypes['replicad'];
    if (declarations === undefined) {
      throw new TypeError('Generated Replicad declarations are missing.');
    }

    expect(getKernelConfig('replicad').codeStandards).toContain(declarations);
  });
});

describe('KernelConfig.topLevelExportExample', () => {
  describe.each(allKernels)('%s', (kernel) => {
    const config = getKernelConfig(kernel);

    it('should expose a non-empty topLevelExportExample snippet', () => {
      expect(config.topLevelExportExample.trim().length).toBeGreaterThan(0);
    });

    it('should never instruct the agent to remove a file or skip the test', () => {
      const corpus = [config.topLevelExportExample, formatAddTopLevelExportRecovery(config)].join('\n');
      expect(corpus).not.toMatch(/remove .* from test\.json/i);
      expect(corpus).not.toMatch(/skip(?:ping)? the test/i);
    });
  });

  describe('kernel-specific vocabulary', () => {
    it('openscad example should mention a top-level invocation', () => {
      const config = getKernelConfig('openscad');
      expect(config.topLevelExportExample).toMatch(/\(\s*\)|invocation|module/i);
    });

    it('replicad example should mention Shape3D', () => {
      const config = getKernelConfig('replicad');
      expect(config.topLevelExportExample).toMatch(/Shape3D/);
    });

    it('replicad multi-shape example should use Title Case display labels while keeping code identifiers idiomatic', () => {
      const config = getKernelConfig('replicad');
      const legacyWheelLeftLabel = `name: '${['Wheel', 'Left'].join('')}'`;
      const legacyWheelRightLabel = `name: '${['Wheel', 'Right'].join('')}'`;

      expect(config.codeStandards).toContain('Use camelCase for variables');
      expect(config.multiShapeExample).toContain('const wheelL');
      expect(config.multiShapeExample).toContain('const wheelR');
      expect(config.multiShapeExample).toContain("name: 'Wheel Left'");
      expect(config.multiShapeExample).toContain("name: 'Wheel Right'");
      expect(config.multiShapeExample).not.toContain(legacyWheelLeftLabel);
      expect(config.multiShapeExample).not.toContain(legacyWheelRightLabel);
    });

    it('replicad guidance should promote batch boolean APIs', () => {
      const config = getKernelConfig('replicad');
      expect(config.topologyHints).toContain('shape.fuseAll([...])');
      expect(config.topologyHints).toContain('shape.cutAll([...])');
      expect(config.topologyHints).toContain('shape.intersectAll([...])');
    });

    it('replicad guidance should promote BRep-native construction before booleans', () => {
      const config = getKernelConfig('replicad');

      expect(config.topologyHints).toContain('CompoundSketch');
      expect(config.topologyHints).toContain('revolve');
      expect(config.topologyHints).toContain('separate named `ShapeConfig`');
      expect(config.topologyHints).toContain('build one prototype then `.clone()` before transforming repeated parts');
    });

    it('replicad guidance should not expose internal boolean implementation knobs', () => {
      const config = getKernelConfig('replicad');
      const corpus = [config.codeStandards, config.topologyHints].join('\n');

      expect(corpus).toContain('optimisation?: BooleanOptimisation');
      expect(corpus).not.toContain('nonDestructive?:');
      expect(corpus).not.toContain('simplify?:');
      expect(corpus).not.toContain('simplifyAngularTolerance?:');
      expect(corpus).not.toContain('fuzzyValue?:');
      expect(corpus).not.toContain('runParallel?:');
      expect(corpus).not.toContain('useOBB?:');
    });

    it('jscad example should mention Geom3', () => {
      const config = getKernelConfig('jscad');
      expect(config.topLevelExportExample).toMatch(/Geom3/);
    });

    it('jscad canonical example should name returned geometry parts', () => {
      const config = getKernelConfig('jscad');
      expect(config.canonicalExample).toContain('const named =');
      expect(config.canonicalExample).toContain(
        "return named(colorize([0.2, 0.55, 0.85, 1], plate), 'Mounting Plate');",
      );
      expect(config.canonicalExample).toContain('mountingPlateProfile');
      expect(config.canonicalExample).toContain('extrudeLinear({ height: p.thickness }, profile)');
      expect(config.canonicalExample).not.toContain('involuteGearProfile');
      expect(config.canonicalExample).not.toContain('rootCircle2D');
      expect(config.canonicalExample).not.toContain('union(rootCircle2D, allTeeth)');
    });

    it('jscad multi-file example should name returned geometry parts', () => {
      const config = getKernelConfig('jscad');
      const libFile = config.multiFileExample?.files.find((file) => file.path === 'lib/widget.ts');
      expect(libFile?.content).toContain('const named =');
      expect(libFile?.content).toContain("named(primitives.cube({ size: 10 }), 'Widget')");
    });

    it('manifold example should mention Manifold', () => {
      const config = getKernelConfig('manifold');
      expect(config.topLevelExportExample).toMatch(/Manifold/);
    });

    it('opencascadejs example should mention TopoDS_Shape', () => {
      const config = getKernelConfig('opencascadejs');
      expect(config.topLevelExportExample).toMatch(/TopoDS_Shape/);
    });

    it('zoo (KCL) example should mention extrude', () => {
      const config = getKernelConfig('zoo');
      expect(config.topLevelExportExample).toMatch(/extrude/i);
    });

    it('kernel code standards should preserve language-specific code casing guidance', () => {
      expect(getKernelConfig('replicad').codeStandards).toContain('Use camelCase for variables');
      expect(getKernelConfig('zoo').codeStandards).toContain('Use camelCase for variables');
      expect(getKernelConfig('openscad').codeStandards).toContain('Use snake_case for variables');
    });
  });
});

describe('KernelConfig.multiFileExample', () => {
  describe.each(allKernels)('%s', (kernel) => {
    const config = getKernelConfig(kernel);
    const example = config.multiFileExample;

    it('should ship a non-empty multiFileExample slot', () => {
      expect(example).toBeDefined();
    });

    it('should declare a mainFile that exists in files[]', () => {
      if (!example) {
        throw new Error('multiFileExample is required');
      }
      const paths = example.files.map((f) => f.path);
      expect(paths).toContain(example.mainFile);
    });

    it('should ship at least one library file alongside the entry (minimal multi-file demo)', () => {
      if (!example) {
        throw new Error('multiFileExample is required');
      }
      expect(example.files.length).toBeGreaterThanOrEqual(2);
    });

    it('should populate every file with non-empty content', () => {
      if (!example) {
        throw new Error('multiFileExample is required');
      }
      for (const file of example.files) {
        expect(file.content.trim().length).toBeGreaterThan(0);
      }
    });

    it('should use the kernel fileExtension on every file', () => {
      if (!example) {
        throw new Error('multiFileExample is required');
      }
      for (const file of example.files) {
        expect(file.path.endsWith(config.fileExtension)).toBe(true);
      }
    });
  });

  describe('OpenSCAD `use` regression guard (dollhouse `include`-duplicate smoking gun)', () => {
    it('should import library files with `use <…>` and never `include <…>`', () => {
      const example = getKernelConfig('openscad').multiFileExample;
      if (!example) {
        throw new Error('multiFileExample is required');
      }
      const main = example.files.find((f) => f.path === 'main.scad')?.content ?? '';
      expect(main).toMatch(/use\s*</);
      expect(main).not.toMatch(/include\s*</);
    });
  });

  describe('TS-based kernels (full-nesting) follow ESM relative-import idiom', () => {
    const tsKernels = ['replicad', 'jscad', 'manifold', 'opencascadejs'] as const;

    describe.each(tsKernels)('%s', (kernel) => {
      const config = getKernelConfig(kernel);
      const example = config.multiFileExample;

      it("should import the library file with `from './lib/<name>.js'`", () => {
        if (!example) {
          throw new Error('multiFileExample is required');
        }
        const main = example.files.find((f) => f.path === example.mainFile)?.content ?? '';
        expect(main).toMatch(/from\s+["']\.\/lib\/[\w-]+\.js["']/);
      });

      it('should keep the library file under `lib/`', () => {
        if (!example) {
          throw new Error('multiFileExample is required');
        }
        const libFile = example.files.find((f) => f.path !== example.mainFile);
        expect(libFile?.path.startsWith('lib/')).toBe(true);
      });

      it('library file should expose at least one `export`', () => {
        if (!example) {
          throw new Error('multiFileExample is required');
        }
        const libFile = example.files.find((f) => f.path !== example.mainFile);
        expect(libFile?.content).toMatch(/\bexport\b/);
      });
    });
  });

  describe('KCL (assembly-only) keeps the layout flat', () => {
    const example = getKernelConfig('zoo').multiFileExample;

    it('should not place any file under a subdirectory', () => {
      if (!example) {
        throw new Error('multiFileExample is required');
      }
      for (const file of example.files) {
        expect(file.path.includes('/')).toBe(false);
      }
    });

    it('should use the KCL `import … from "…"` idiom in the entry path', () => {
      if (!example) {
        throw new Error('multiFileExample is required');
      }
      const main = example.files.find((f) => f.path === example.mainFile)?.content ?? '';
      expect(main).toMatch(/import\s+\w+\s+from\s+"[^"]+\.kcl"/);
    });
  });
});

describe('KernelConfig.topologyHints', () => {
  describe.each(allKernels)('%s', (kernel) => {
    const config = getKernelConfig(kernel);

    it('should expose a non-empty topologyHints string', () => {
      expect(config.topologyHints.trim().length).toBeGreaterThan(40);
    });
  });

  describe('kernel-specific vocabulary', () => {
    it('replicad should name drawSplineCurve and drawArc', () => {
      const { topologyHints } = getKernelConfig('replicad');
      expect(topologyHints).toMatch(/drawSplineCurve/);
      expect(topologyHints).toMatch(/drawArc/);
    });

    it('opencascadejs should name Geom2dAPI_PointsToBSpline and GC_MakeArcOfCircle', () => {
      const { topologyHints } = getKernelConfig('opencascadejs');
      expect(topologyHints).toMatch(/Geom2dAPI_PointsToBSpline/);
      expect(topologyHints).toMatch(/GC_MakeArcOfCircle/);
    });

    it('zoo (KCL) should name tangentialArc and bezierCurve', () => {
      const { topologyHints } = getKernelConfig('zoo');
      expect(topologyHints).toMatch(/tangentialArc/);
      expect(topologyHints).toMatch(/bezierCurve/);
    });

    it('manifold should encode the segment-count heuristic and Manifold.cylinder', () => {
      const { topologyHints } = getKernelConfig('manifold');
      expect(topologyHints).toMatch(/segment count, not curve form/i);
      expect(topologyHints).toMatch(/Manifold\.cylinder/);
    });

    it('jscad should encode the segment-count heuristic and extrudeRotate', () => {
      const { topologyHints } = getKernelConfig('jscad');
      expect(topologyHints).toMatch(/segment count, not curve form/i);
      expect(topologyHints).toMatch(/extrudeRotate/);
      expect(topologyHints).toContain('compose the 2D profile');
      expect(topologyHints).toContain('call `extrudeLinear` once');
      expect(topologyHints).toMatch(/non-manifold `geom3`/i);
      expect(topologyHints).toMatch(/named\(shape, 'Part Name'\)/);
    });

    it('jscad should include the 3D mesh CSG manifold failure mode inventory', () => {
      const { commonErrorPatterns } = getKernelConfig('jscad');
      expect(commonErrorPatterns).toContain('3D mesh CSG');
      expect(commonErrorPatterns).toContain('overlapping/touching/contained primitives');
      expect(commonErrorPatterns).toMatch(/non-manifold geom3s/i);
    });

    it('openscad should prefer $fa/$fs and warn on hull/minkowski misuse and render() overuse', () => {
      const { topologyHints } = getKernelConfig('openscad');
      expect(topologyHints).toMatch(/\$fa/);
      expect(topologyHints).toMatch(/\$fs/);
      expect(topologyHints).toMatch(/hull\(\)/);
      expect(topologyHints).toMatch(/minkowski\(\)/);
      expect(topologyHints).toMatch(/render\(\)/);
    });
  });

  describe('cross-kernel contamination guard', () => {
    it('B-rep kernel hints should not leak OpenSCAD-only $fn/$fa/$fs vocabulary', () => {
      for (const kernel of ['replicad', 'opencascadejs', 'zoo'] as const) {
        const { topologyHints } = getKernelConfig(kernel);
        expect(topologyHints).not.toMatch(/\$fa/);
        expect(topologyHints).not.toMatch(/\$fs/);
        expect(topologyHints).not.toMatch(/\$fn/);
      }
    });

    it('mesh kernel hints should not leak B-rep curve vocabulary', () => {
      for (const kernel of ['manifold', 'jscad', 'openscad'] as const) {
        const { topologyHints } = getKernelConfig(kernel);
        expect(topologyHints).not.toMatch(/drawSplineCurve/);
        expect(topologyHints).not.toMatch(/Geom2dAPI_PointsToBSpline/);
        expect(topologyHints).not.toMatch(/tangentialArc/);
      }
    });
  });
});

describe('KernelConfig.testingProfile', () => {
  it('should expose BRep feature examples only for kernels with exact BRep evidence', () => {
    expect(getKernelConfig('replicad').testingProfile.includeBrepFeatureExamples).toBe(true);
    expect(getKernelConfig('opencascadejs').testingProfile.includeBrepFeatureExamples).toBe(true);

    for (const kernel of ['openscad', 'jscad', 'manifold', 'zoo'] as const) {
      expect(getKernelConfig(kernel).testingProfile.includeBrepFeatureExamples).toBe(false);
    }
  });
});

describe('formatAddTopLevelExportRecovery', () => {
  describe.each(allKernels)('%s', (kernel) => {
    const config = getKernelConfig(kernel);
    const recovery = formatAddTopLevelExportRecovery(config);

    it('should produce a non-empty recovery sentence', () => {
      expect(recovery.trim().length).toBeGreaterThan(0);
    });

    it('should embed the kernel topLevelExportExample verbatim', () => {
      expect(recovery).toContain(config.topLevelExportExample);
    });

    it('should tell the agent the file should render standalone', () => {
      expect(recovery).toMatch(/renders standalone/);
    });
  });
});
