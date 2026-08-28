/**
 * Compact Bundler Feature Matrix
 *
 * A deliberately cheap Replicad model that exercises Tau's supported source
 * graph and asset APIs without letting CAD complexity dominate benchmarks.
 */
import { makeBox, makeCylinder } from 'replicad';
import type { ShapeConfig } from 'replicad';
import { frame } from '@taucad/replicad/annotations';

import assetConfig from './assets/config.json';
import payloadBase64 from './assets/payload.bin?base64';
import payloadDataUrl from './assets/payload.bin?dataurl';
import payloadFile from './assets/payload.bin?file';
import payloadBytes from './assets/payload.bin' with { type: 'bytes' };
import rawLabel from './assets/label.txt?raw';
import textLabel from './assets/label.txt' with { type: 'text' };
import { featureCount } from './lib/features';
import { profileScale } from './lib/profile.js';
import { rootOffset } from './lib/constants.js';
import { palette } from './lib/palette.js';
import { tsxDescriptor } from './ui/badge.tsx';
import { jsxDescriptor } from './ui/tag.jsx';

const defaultParams = {
  width: 32,
  depth: 24,
  height: 6,
  pinRadius: 3,
  showPin: true,
};

const getParameterDefinitions = () => [
  { name: 'width', type: 'float', initial: defaultParams.width },
  { name: 'depth', type: 'float', initial: defaultParams.depth },
  { name: 'height', type: 'float', initial: defaultParams.height },
  { name: 'pinRadius', type: 'float', initial: defaultParams.pinRadius },
  { name: 'showPin', type: 'checkbox', checked: defaultParams.showPin },
];

export const defaultName = 'Bundler feature matrix';

const validateBundlerFeatures = (): number => {
  if (
    rawLabel !== textLabel ||
    payloadBase64 !== 'QUIK' ||
    payloadFile !== payloadDataUrl
  ) {
    throw new Error('Bundler asset modes produced inconsistent values.');
  }
  if (payloadBytes[0] !== 65 || payloadBytes[1] !== 66) {
    throw new Error('Bundler byte imports produced inconsistent values.');
  }
  if (
    tsxDescriptor.props.kind !== 'tsx' ||
    jsxDescriptor.props.kind !== 'jsx'
  ) {
    throw new Error('Bundler JSX transforms produced inconsistent values.');
  }
  return rootOffset + featureCount + profileScale + assetConfig.dimensionBias;
};

const main = (parameters = defaultParams): ShapeConfig[] => {
  const featureBias = validateBundlerFeatures();
  const base = makeBox(
    [0, 0, 0],
    [parameters.width + featureBias, parameters.depth, parameters.height],
  );
  const shapes: ShapeConfig[] = [
    {
      shape: base,
      name: `${textLabel.trim()} base`,
      color: palette.base,
      interfaces: { origin: frame({ origin: [0, 0, 0] }) },
    },
  ];

  if (parameters.showPin) {
    shapes.push({
      shape: makeCylinder(parameters.pinRadius, parameters.height + 4, [
        parameters.width / 2,
        parameters.depth / 2,
        0,
      ]),
      name: `${assetConfig.variant} pin`,
      color: palette.accent,
      metalness: 0.2,
      roughness: 0.6,
    });
  }
  return shapes;
};
