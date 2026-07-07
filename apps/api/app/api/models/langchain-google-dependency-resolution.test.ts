// @vitest-environment node
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

type PackageJson = {
  name: string;
  version: string;
};

describe('LangChain Google dependency resolution', () => {
  it('loads upstream google-vertexai with only the forked google-common override', () => {
    const rootRequire = createRequire(import.meta.url);
    const vertexPackageJsonPath = rootRequire.resolve('@langchain/google-vertexai/package.json');
    const vertexRequire = createRequire(vertexPackageJsonPath);
    const vertexPackageJson = vertexRequire('@langchain/google-vertexai/package.json') as PackageJson;

    expect(vertexPackageJson).toMatchObject({
      name: '@langchain/google-vertexai',
      version: '2.2.0',
    });
    expect(vertexPackageJsonPath).not.toContain('langchain-fork');

    const gauthPackageJsonPath = vertexRequire.resolve('@langchain/google-gauth/package.json');
    const gauthPackageJson = vertexRequire('@langchain/google-gauth/package.json') as PackageJson;

    expect(gauthPackageJson).toMatchObject({
      name: '@langchain/google-gauth',
      version: '2.2.0',
    });
    expect(gauthPackageJsonPath).not.toContain('langchain-fork');

    const googleCommonPackageJsonPath = vertexRequire.resolve('@langchain/google-common/package.json');
    const googleCommonPackageJson = vertexRequire('@langchain/google-common/package.json') as PackageJson;

    expect(googleCommonPackageJson).toMatchObject({
      name: '@langchain/google-common',
      version: '2.2.0-beta.0',
    });
    expect(googleCommonPackageJsonPath).toContain('file+tarballs+langchain-fork');
    expect(googleCommonPackageJsonPath).not.toContain('2.1.33');

    const googleCommonRoot = dirname(googleCommonPackageJsonPath);
    const typesSource = readFileSync(join(googleCommonRoot, 'dist/types.d.ts'), 'utf8');
    const geminiSource = readFileSync(join(googleCommonRoot, 'dist/utils/gemini.js'), 'utf8');
    const chatModelsSource = readFileSync(join(googleCommonRoot, 'dist/chat_models.js'), 'utf8');

    expect(typesSource).toContain('streamFunctionCallArguments?: boolean');
    expect(geminiSource).toContain('partialArgs');
    expect(geminiSource).toContain('streamFunctionCallArguments');
    expect(chatModelsSource).toContain('output === null');
    expect(chatModelsSource).toContain('firstSignature');
    expect(chatModelsSource).toContain('thoughtSignature');
    expect(geminiSource).not.toContain('stableToolCallId');
    expect(chatModelsSource).toContain('lc-tool-call');
  });
});
