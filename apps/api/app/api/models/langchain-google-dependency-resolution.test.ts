// @vitest-environment node
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

type PackageJson = {
  name: string;
  version: string;
};

describe('LangChain Google dependency resolution', () => {
  it('loads the forked google-common package from the google-vertexai dependency context', () => {
    const rootRequire = createRequire(import.meta.url);
    const vertexPackageJsonPath = rootRequire.resolve('@langchain/google-vertexai/package.json');
    const vertexRequire = createRequire(vertexPackageJsonPath);

    const googleCommonPackageJsonPath = vertexRequire.resolve('@langchain/google-common/package.json');
    const googleCommonPackageJson = vertexRequire('@langchain/google-common/package.json') as PackageJson;

    expect(googleCommonPackageJson).toMatchObject({
      name: '@langchain/google-common',
      version: '2.1.33',
    });
    expect(googleCommonPackageJsonPath).toContain('file+tarballs+langchain-fork');
    expect(googleCommonPackageJsonPath).toContain('langchain-google-common-2.1.33');
    expect(googleCommonPackageJsonPath).not.toContain('@langchain+google-common@2.1.30');
  });
});
