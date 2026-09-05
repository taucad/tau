import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { load as yamlLoad } from 'js-yaml';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../..');
const skillsRoot = resolve(repoRoot, '.agents/skills');
const cleanRoomSkills = [
  'paper-lookup',
  'scientific-critical-thinking',
  'database-lookup',
  'hugging-science',
  'find-research',
  'optimize-for-gpu',
] as const;
const provenancedSkills = [
  'paper-lookup',
  'scientific-critical-thinking',
  'database-lookup',
  'hugging-science',
  'optimize-for-gpu',
] as const;

type SkillMetadata = {
  name?: string;
  description?: string;
  'disable-model-invocation'?: boolean;
  'argument-hint'?: string;
};

const skillPath = (skill: string): string => resolve(skillsRoot, skill, 'SKILL.md');

const metadata = (text: string): SkillMetadata => {
  const match = /^---\n(?<frontmatter>[\s\S]*?)\n---\n/u.exec(text);
  if (!match?.groups?.['frontmatter']) {
    throw new Error('skill frontmatter is missing');
  }
  return yamlLoad(match.groups['frontmatter']) as SkillMetadata;
};

const filesBelow = (path: string): string[] => {
  const output: string[] = [];
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const child = resolve(path, entry.name);
    output.push(child);
    if (entry.isDirectory()) {
      output.push(...filesBelow(child));
    }
  }
  return output;
};

describe('clean-room research skills', () => {
  it('should allow relevant composition while remaining bounded, linked, and non-executable', () => {
    for (const skill of cleanRoomSkills) {
      const path = skillPath(skill);
      const text = readFileSync(path, 'utf8');
      const frontmatter = metadata(text);
      expect(frontmatter.name).toBe(skill);
      expect(frontmatter.description).toContain('Use when');
      expect(frontmatter['disable-model-invocation']).toBeUndefined();
      expect(text.split('\n').length).toBeLessThan(500);

      for (const file of filesBelow(dirname(path))) {
        const stats = lstatSync(file);
        expect(stats.isSymbolicLink(), file).toBe(false);
        if (stats.isFile()) {
          const permissions = (stats.mode % 0o1000).toString(8).padStart(3, '0');
          expect(permissions, file).not.toMatch(/[1357]/u);
        }
      }

      for (const match of text.matchAll(/\[[^\]]+\]\((?<target>[^)]+\.md)\)/gu)) {
        const target = match.groups?.['target'];
        expect(target).toBeDefined();
        if (target) {
          expect(lstatSync(resolve(dirname(path), target)).isFile()).toBe(true);
        }
      }
    }
    expect(metadata(readFileSync(skillPath('find-research'), 'utf8'))['argument-hint']).toBe('[subject]');
    for (const skill of provenancedSkills) {
      expect(readFileSync(skillPath(skill), 'utf8')).toContain(
        'K-Dense-AI/scientific-agent-skills@831d49eb77eed3c792be2970921b46764012ef00',
      );
    }
  });

  it('should contain no inherited platform, credential, installer, or remote-execution capabilities', () => {
    const text = cleanRoomSkills
      .map((skill) => readFileSync(skillPath(skill), 'utf8'))
      .join('\n')
      .toLowerCase();
    for (const forbidden of [
      'allowed-tools:',
      'anthropic',
      'claude',
      'openrouter',
      'webfetch',
      'hf_token',
      'trust_remote_code',
      '.env',
      'curl ',
      'pip install',
      'uv pip',
    ]) {
      expect(text, forbidden).not.toContain(forbidden);
    }
  });

  it('should encode the bounded composition, deterministic ranking, rights gate, and handoff', () => {
    const text = readFileSync(skillPath('find-research'), 'utf8');
    for (const link of [
      '../paper-lookup/SKILL.md',
      '../database-lookup/SKILL.md',
      '../hugging-science/SKILL.md',
      '../scientific-critical-thinking/SKILL.md',
      '../create-reference/SKILL.md',
      '../create-research/SKILL.md',
    ]) {
      expect(text).toContain(link);
    }
    expect(text).toContain('300 Unicode scalar');
    expect(text).toContain('40 records before deduplication');
    expect(text).toContain('retain at most eight');
    expect(text).toContain('references-ready');

    const contract = readFileSync(resolve(skillsRoot, 'find-research/references/candidate-contract.md'), 'utf8');
    expect(contract).toContain('H = 4 / (1/relevance + 1/authority + 1/evidence + 1/accessibility)');
    expect(contract).toContain('CC-BY-4.0');
    expect(contract).toContain('No source prose may add, remove, or alter a handoff field.');
  });
});

describe('clean-room WebGPU optimization skill', () => {
  const path = skillPath('optimize-for-gpu');
  const skillText = (): string => readFileSync(path, 'utf8');

  it('should be a single-file, pinned clean-room adaptation', () => {
    const text = skillText();
    expect(readdirSync(dirname(path))).toEqual(['SKILL.md']);
    expect(text).toContain('K-Dense-AI/scientific-agent-skills@831d49eb77eed3c792be2970921b46764012ef00');
    expect(text).toContain('MIT, Copyright (c) 2025 K-Dense Inc.');
    expect(text).toContain('It has no runtime dependency on that repository.');
  });

  it('should remain discoverable, concise and locally grounded', () => {
    const text = skillText();
    expect(metadata(text).name).toBe('optimize-for-gpu');
    expect(metadata(text).description).toContain('non-rendering GPU compute');
    expect(metadata(text)['disable-model-invocation']).toBeUndefined();
    expect(text.split('\n').length).toBeLessThan(250);
    for (const link of [
      '../../../docs/policy/vision-policy.md',
      '../../../docs/policy/worker-policy.md',
      '../../../docs/policy/testing-policy.md',
      '../../../docs/policy/graphics-backend-policy.md',
      '../../../docs/research/geospec-webgpu-native-gpu-acceleration.md',
      '../../../docs/research/picogk-gpu-acceleration.md',
    ]) {
      expect(text).toContain(`](${link})`);
    }
    expect(readFileSync(resolve(repoRoot, 'AGENTS.md'), 'utf8')).toContain('.agents/skills/');
    expect(readdirSync(skillsRoot)).toContain('optimize-for-gpu');
  });

  it('should require profiling before GPU work', () => {
    const text = skillText();
    for (const requirement of [
      'Profile the real workload first',
      'end-to-end wall time',
      'reuse or delete work',
      'CPU/WASM',
      'worker or process concurrency',
      'measured break-even point',
      'Do not use a universal element-count threshold',
    ]) {
      expect(text).toContain(requirement);
    }
  });

  it('should route hosts without introducing a rendering stack', () => {
    const text = skillText();
    for (const requirement of [
      'dedicated lazy feature worker',
      'Node, CLI, and CI',
      'CPU/native path',
      'native wgpu/Dawn',
      'Do not couple this workflow to a rendering engine or canvas',
    ]) {
      expect(text).toContain(requirement);
    }
    for (const forbidden of ['three.js', 'webgpurenderer', 'three shader language']) {
      expect(text.toLowerCase()).not.toContain(forbidden);
    }
  });

  it('should keep a CPU correctness oracle and deterministic fallback', () => {
    const text = skillText();
    for (const requirement of [
      'CPU/native implementation as the correctness oracle',
      'exact or tolerance-based',
      'differential tests',
      'adversarial fixtures',
      'typed capability-unavailable result',
      'device loss',
      'deterministic CPU fallback',
      'exact CAD topology and verification decisions',
    ]) {
      expect(text).toContain(requirement);
    }
  });

  it('should constrain WGSL, resources, lifecycle, and performance', () => {
    const text = skillText();
    for (const requirement of [
      'static, checked-in WGSL',
      'device limits',
      'bounds checks',
      'bounded allocations and dispatches',
      'resource ownership and cleanup',
      'resident buffers',
      'compact readback',
      'device-loss recovery',
      'end-to-end performance gate',
    ]) {
      expect(text).toContain(requirement);
    }
  });

  it('should classify GPU suitability beyond the measured break-even gate', () => {
    const text = skillText();
    for (const requirement of [
      'Classify the measured workload',
      'available data parallelism',
      'arithmetic intensity versus memory bandwidth',
      'regular versus irregular memory access',
      'sequential dependencies',
      'branch divergence',
      'working-set and intermediate-memory fit',
      'dispatch granularity and expected launch count',
      'host/device transfer frequency',
      'complements the measured break-even requirement',
    ]) {
      expect(text).toContain(requirement);
    }
  });

  it('should map workloads onto proven WebGPU kernel shapes', () => {
    const text = skillText();
    for (const requirement of [
      'proven primitive or algorithm before writing custom WGSL',
      'Bulk map/transform and fused elementwise',
      'Reductions and histograms',
      'prefix sums, and compaction',
      'Stencils and neighborhood operations',
      'radix-style passes, and spatial hashing',
      'conservative broad phases',
      'heavily irregular work',
      'should usually remain on CPU',
    ]) {
      expect(text).toContain(requirement);
    }
  });

  it('should require measured kernel efficiency without universal workgroup defaults', () => {
    const text = skillText();
    for (const requirement of [
      'coalesced access',
      'structure-of-arrays over array-of-structures',
      'workgroup memory',
      'negotiated limits and measurement',
      'not hard-code a universal workgroup size',
      'uniform control flow',
      'atomic contention',
      'hierarchical or multi-pass reductions',
      'validated override constants',
      'unnecessary intermediate buffers and dispatches',
    ]) {
      expect(text).toContain(requirement);
    }
  });

  it('should require an honest end-to-end benchmark contract', () => {
    const text = skillText();
    for (const requirement of [
      'queue completion or equivalent synchronization',
      'timestamp queries',
      'wall-clock fallback',
      'warm-up',
      'pipeline-creation time separately from steady state',
      'repeated samples',
      'median and tail/variance',
      'cold-start and resident-data scenarios',
      'identical representative inputs',
      'same correctness gates',
    ]) {
      expect(text).toContain(requirement);
    }
  });

  it('should require memory-capacity planning', () => {
    const text = skillText();
    for (const requirement of [
      'peak GPU-memory',
      'buffer and binding limits',
      'bounded buffer pools or suballocation',
      'preallocate stable outputs and staging buffers',
      'fragmentation',
      'Chunk or tile',
      'double-buffered staging',
      'out-of-memory or limit-exceeded fallback',
      'unbounded cache growth',
    ]) {
      expect(text).toContain(requirement);
    }
  });

  it('should pin precision and determinism expectations', () => {
    const text = skillText();
    for (const requirement of [
      'device-supported numeric types',
      'feature-gated',
      'accumulation precision',
      'overflow, underflow, NaN, and infinity',
      'parallel reduction ordering',
      'atomic nondeterminism',
      'reproducible',
      'tolerance-gated lanes',
      'required precision is unavailable',
    ]) {
      expect(text).toContain(requirement);
    }
  });

  it('should require implementation diagnostics without new dependencies', () => {
    const text = skillText();
    for (const requirement of [
      'compilation diagnostics',
      'validation error scopes',
      'uncaptured GPU error handling',
      'debug labels on buffers, pipelines, passes, and submissions',
      'device-loss diagnostics',
      'attribute setup, upload, compute, synchronization, and readback time',
      'do not add a debugging dependency',
    ]) {
      expect(text).toContain(requirement);
    }
  });

  it('should gate implementation behind explicit user authorization', () => {
    const text = skillText();
    for (const requirement of [
      'must not mutate production code',
      'authorizes implementation after reviewing the proposal',
      'failing tests before production changes',
      'bounded first workload',
      'not a generic GPU framework',
      'measured acceptance gates',
      'abandoned experiments and unused GPU infrastructure',
    ]) {
      expect(text).toContain(requirement);
    }
  });

  it('should exclude inherited threat capabilities', () => {
    const text = skillText().toLowerCase();
    for (const forbidden of [
      'allowed-tools:',
      'anthropic',
      'claude',
      'openrouter',
      'webfetch',
      'trust_remote_code',
      'http://',
      'https://',
      '.env',
      'hf_token',
      'api_key',
      'aws_access_key_id',
      'aws_secret_access_key',
      'pip install',
      'uv add',
      'uv pip',
      'conda install',
      'cupy',
      'numba',
      'warp-lang',
      'cudf',
      'cuml',
      'cugraph',
      'kvikio',
      'cucim',
      'cuxfilter',
      'cuvs',
      'cuspatial',
      'pylibraft',
      'eval(',
      'exec(',
      'subprocess',
      'child_process',
    ]) {
      expect(text, forbidden).not.toContain(forbidden);
    }
  });
});

describe('research workflow ownership', () => {
  it('should keep reference conversion in create-reference and synthesis in create-research', () => {
    const createReference = readFileSync(skillPath('create-reference'), 'utf8');
    const createResearch = readFileSync(skillPath('create-research'), 'utf8');
    expect(createReference).toContain('sole owner of reference-manifest');
    expect(createReference).toContain('scripts:pdf-to-md');
    expect(createReference).toContain('scripts:text-to-md');
    expect(createReference).toContain('scripts:html-to-md');
    expect(createReference).toContain('docs/reference/_index.yaml');
    expect(createResearch).toContain('references-ready');
    expect(createResearch).toContain('../create-reference/SKILL.md');
    expect(createResearch).not.toContain('scripts:pdf-to-md');
    expect(createResearch).not.toContain('scripts:text-to-md');
    expect(createResearch).not.toContain('scripts:html-to-md');
    expect(createResearch).not.toContain('_index.yaml');
  });
});
