import { describe, expect, it } from 'vitest';
import type { PackageState } from '#promote-npm-train.js';
import { planPromotion, slsaProvenanceV1 } from '#promote-npm-train.js';

const tau = 'git+https://github.com/taucad/tau.git';
const trained = (extra: PackageState['versions'] = {}, latest = '0.0.0'): PackageState => ({
  distTags: { latest, beta: '0.1.0-beta.4' },
  versions: {
    '0.0.0': {},
    '0.1.0-beta.4': { predicateType: slsaProvenanceV1, repositoryUrl: tau },
    ...extra,
  },
});

describe('planPromotion', () => {
  it('moves latest to the train and deprecates the bootstrap placeholder', () => {
    expect(planPromotion('0.1.0-beta.4', { '@taucad/host': trained() })).toEqual({
      refusals: [],
      commands: [
        ['dist-tag', 'add', '@taucad/host@0.1.0-beta.4', 'latest'],
        [
          'deprecate',
          '@taucad/host@0.0.0',
          'Trusted Publishing bootstrap placeholder with no code; install @taucad/host@latest.',
        ],
      ],
    });
  });

  it("deprecates the replicad fork's versions with a pointer to @taulabs/replicad", () => {
    const { commands } = planPromotion('0.1.0-beta.4', {
      '@taucad/replicad': trained({
        '0.21.0-v8.57.1': { repositoryUrl: 'git+https://github.com/taucad/replicad.git' },
      }),
    });

    expect(commands).toContainEqual([
      'deprecate',
      '@taucad/replicad@0.21.0-v8.57.1',
      expect.stringContaining('use @taulabs/replicad'),
    ]);
  });

  it('refuses everything when one package lacks the version or its provenance', () => {
    const plan = planPromotion('0.1.0-beta.4', {
      '@taucad/host': trained(),
      '@taucad/cli': { distTags: {}, versions: { '0.1.0-beta.4': {} } },
      '@taucad/ui': { distTags: {}, versions: {} },
    });

    expect(plan.commands).toEqual([]);
    expect(plan.refusals).toEqual([
      '@taucad/cli@0.1.0-beta.4 carries no SLSA provenance attestation',
      '@taucad/ui@0.1.0-beta.4 is not on the registry',
    ]);
  });

  it('skips what is already done, so a rerun continues', () => {
    const state = trained({}, '0.1.0-beta.4');
    const done: PackageState = { ...state, versions: { ...state.versions, '0.0.0': { deprecated: 'placeholder' } } };

    expect(planPromotion('0.1.0-beta.4', { '@taucad/host': done }).commands).toEqual([]);
  });

  it('deprecates a superseded package only while it exists undeprecated', () => {
    const { commands } = planPromotion(
      '0.1.0-beta.4',
      {},
      {
        '@taucad/events': { distTags: {}, versions: { '0.1.0-beta.0': {} } },
        '@taucad/memory': { distTags: {}, versions: { '0.1.0-beta.0': { deprecated: 'done' } } },
      },
    );

    expect(commands).toEqual([['deprecate', '@taucad/events@0.1.0-beta.0', 'Bundled into @taucad/runtime.']]);
  });
});
