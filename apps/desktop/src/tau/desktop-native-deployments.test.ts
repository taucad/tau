import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  desktopNativeDeployments,
  nativePackageResources,
  preparableNativeDeployments,
} from '#tau/desktop-native-deployments.js';

describe('preparableNativeDeployments', () => {
  it('should read each package from the copies under the packaged app resources', () => {
    const resourcesPath = join('/Applications', 'Tau.app', 'Contents', 'Resources');
    const deployments = preparableNativeDeployments({ packaged: true, resourcesPath });

    expect(deployments.map(({ packageRoot }) => fileURLToPath(packageRoot))).toEqual(
      desktopNativeDeployments.map(({ package: name }) => `${join(resourcesPath, nativePackageResources, name)}/`),
    );
  });

  it('should read each package from its installed directory in a development build', () => {
    for (const { packageRoot } of preparableNativeDeployments({ packaged: false, resourcesPath: '/unused' })) {
      expect(packageRoot.endsWith('/')).toBe(true);
      expect(existsSync(join(fileURLToPath(packageRoot), 'tau-plugin.json'))).toBe(true);
    }
  });
});
