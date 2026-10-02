import type { KernelProvider } from '@taucad/runtime';
import { describe, expect, it } from 'vitest';
import {
  formatAddTopLevelExportRecovery,
  getKernelConfig,
} from '#api/chat/prompts/kernel-prompt-configs/kernel.prompt.config.js';

const allKernels: readonly KernelProvider[] = ['openscad', 'replicad', 'jscad', 'manifold', 'opencascadejs', 'zoo'];

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

    it('jscad example should mention Geom3', () => {
      const config = getKernelConfig('jscad');
      expect(config.topLevelExportExample).toMatch(/Geom3/);
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

    it('should use the KCL `import … from "…"` idiom in the entry file', () => {
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
