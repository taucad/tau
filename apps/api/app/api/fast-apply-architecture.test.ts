// @vitest-environment node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appRoot = fileURLToPath(new URL('..', import.meta.url));
const architectureTestPath = fileURLToPath(import.meta.url);
const fastApplyDirectory = resolve(appRoot, 'api/file-edit');
const fastApplyFiles = ['file-edit.controller.ts', 'file-edit.module.ts', 'file-edit.service.ts'];

const typeScriptFiles = (): string[] =>
  readdirSync(appRoot, { recursive: true, encoding: 'utf8' })
    .filter((path) => path.endsWith('.ts'))
    .map((path) => resolve(appRoot, path))
    .filter((path) => path !== architectureTestPath);

// The `edit_file` tool implementation moved out of the API with W3-CUT (the
// agent runs in the browser host); what remains to guard here is that no Morph
// fast-apply route, service, or SDK import comes back into the API graph.
describe('Morph fast-apply architecture', () => {
  it('has no fast-apply route or service implementation', () => {
    expect(fastApplyFiles.filter((file) => existsSync(resolve(fastApplyDirectory, file)))).toEqual([]);
  });

  it('has no file-edit module imports left in the API graph', () => {
    const importers = typeScriptFiles()
      .filter((path) => readFileSync(path, 'utf8').includes("from '#api/file-edit/"))
      .map((path) => relative(appRoot, path))
      .sort();

    expect(importers).toEqual([]);
  });

  it('has no Morph SDK importers left in the API graph', () => {
    const morphSdkImporters = typeScriptFiles()
      .filter((path) => readFileSync(path, 'utf8').includes("from '@morphllm/morphsdk'"))
      .map((path) => relative(appRoot, path));

    expect(morphSdkImporters).toEqual([]);
  });

  it('V6 boots the API graph with MORPH_API_KEY unset', async () => {
    const morphApiKey = process.env.MORPH_API_KEY;
    process.env.MORPH_API_KEY = '';
    try {
      const [{ Test }, { AppModule }] = await Promise.all([import('@nestjs/testing'), import('#app.module.js')]);
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
      await moduleRef.close();
    } finally {
      if (morphApiKey === undefined) {
        delete process.env.MORPH_API_KEY;
      } else {
        process.env.MORPH_API_KEY = morphApiKey;
      }
    }
  });
});
