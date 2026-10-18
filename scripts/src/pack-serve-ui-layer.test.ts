import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  linkSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  packServeUiLayer,
  requireServeUiLayerBudget,
  serveUiLayerLimitBytes,
  verifyServeUiLayer,
} from '#pack-serve-ui-layer.js';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});
const fixture = (): { build: string; output: string; restored: string } => {
  const root = mkdtempSync(join(tmpdir(), 'tau-s12-pack-'));
  directories.push(root);
  const build = join(root, 'build');
  mkdirSync(join(build, 'client/assets'), { recursive: true });
  writeFileSync(join(build, 'client/index.html'), '<script src="/assets/app.js"></script>');
  const output = join(root, 'output');
  const restored = join(root, 'restored');
  mkdirSync(restored);
  return { build, output, restored };
};
const map = (file: string): string =>
  JSON.stringify({ version: 3, file, sources: ['source.ts'], sourcesContent: ['const value = 42;'], mappings: 'AAAA' });
const extract = (archive: string, destination: string): void => {
  const result = spawnSync('tar', ['-xzf', archive, '-C', destination], { encoding: 'utf8' });
  expect(result.status, result.stderr).toBe(0);
};

describe('S12 runtime layer', () => {
  it('should verify extracted bytes and reject changed, missing or extra runtime files', () => {
    const { build, output, restored } = fixture();
    packServeUiLayer(build, output);
    extract(join(output, 'serve-ui-client.tar.gz'), restored);
    expect(() => {
      verifyServeUiLayer(restored, output);
    }).not.toThrow();
    const index = join(restored, 'client/index.html');
    writeFileSync(index, 'altered');
    expect(() => {
      verifyServeUiLayer(restored, output);
    }).toThrow('differ from the manifest');
    rmSync(index);
    expect(() => {
      verifyServeUiLayer(restored, output);
    }).toThrow('differ from the manifest');
    extract(join(output, 'serve-ui-client.tar.gz'), restored);
    writeFileSync(join(restored, 'client/extra.js'), 'unexpected');
    expect(() => {
      verifyServeUiLayer(restored, output);
    }).toThrow('differ from the manifest');
    rmSync(join(restored, 'client/extra.js'));
    writeFileSync(join(output, 'serve-ui-client.tar.gz'), 'changed archive');
    expect(() => {
      verifyServeUiLayer(restored, output);
    }).toThrow('differ from the manifest');
  });

  it('should enforce the decimal charter budget and reject the observed oversized layer', () => {
    expect(serveUiLayerLimitBytes).toBe(150_000_000);
    expect(() => {
      requireServeUiLayerBudget(172_442_290);
    }).toThrow('exceeds');
    expect(() => {
      requireServeUiLayerBudget(150_000_001);
    }).toThrow('exceeds');
    expect(() => {
      requireServeUiLayerBudget(150_000_000);
    }).not.toThrow();
    expect(() => {
      requireServeUiLayerBudget(122_334_280);
    }).not.toThrow();
  });

  it('should preserve runtime bytes, licenses, maps and original build in one complete archive', () => {
    const { build, output, restored } = fixture();
    writeFileSync(join(build, 'client/assets/app.js'), 'export const value = 42;');
    writeFileSync(join(build, 'client/assets/app.js.map'), map('app.js'));
    writeFileSync(join(build, 'client/assets/kernel.wasm'), Buffer.from([0, 97, 115, 109]));
    writeFileSync(join(build, 'client/assets/LICENSE.txt'), 'Required attribution');
    writeFileSync(join(build, 'client/assets/data.map'), 'Runtime map data, not a source map');
    packServeUiLayer(build, output);
    extract(join(output, 'serve-ui-client.tar.gz'), restored);
    expect(readdirSync(join(restored, 'client/assets'))).toContain('app.js.map');
    for (const file of ['app.js', 'kernel.wasm', 'LICENSE.txt', 'data.map']) {
      expect(readFileSync(join(restored, 'client/assets', file))).toEqual(
        readFileSync(join(build, 'client/assets', file)),
      );
    }
    expect(readFileSync(join(restored, 'client/assets/app.js.map'))).toEqual(
      readFileSync(join(build, 'client/assets/app.js.map')),
    );
    const manifest: unknown = JSON.parse(readFileSync(join(output, 'serve-ui-layer-manifest.json'), 'utf8'));
    expect(manifest).toMatchObject({
      limitBytes: 150_000_000,
      runtimeSha256: createHash('sha256')
        .update(readFileSync(join(output, 'serve-ui-client.tar.gz')))
        .digest('hex'),
    });
    const first = readFileSync(join(output, 'serve-ui-client.tar.gz'));
    packServeUiLayer(build, output);
    expect(readFileSync(join(output, 'serve-ui-client.tar.gz'))).toEqual(first);
  });

  it.each([
    '//# sourceMappingURL=app.js.map',
    'const debug = "app.js.map";',
    "fetch('app.js'+'.map')",
    '//# sourceMappingURL=app%2Ejs.map',
    "fetch(['app.js','map'].join('.'))",
  ])('should retain a map referenced by its code: %s', (reference) => {
    const { build, output, restored } = fixture();
    writeFileSync(join(build, 'client/assets/app.js'), reference);
    writeFileSync(join(build, 'client/assets/app.js.map'), map('app.js'));
    packServeUiLayer(build, output);
    extract(join(output, 'serve-ui-client.tar.gz'), restored);
    expect(readFileSync(join(restored, 'client/assets/app.js.map'), 'utf8')).toBe(map('app.js'));
  });

  it('should reject output inside the build without mutating its inputs', () => {
    const { build } = fixture();
    expect(() => {
      packServeUiLayer(build, join(build, 'client/output'));
    }).toThrow('outside the client build');
    expect(readdirSync(join(build, 'client'))).toEqual(['assets', 'index.html']);
  });

  it.each(['manifest.json', 'loader.mjs', 'loader.cjs'])('should retain encoded references in %s', (file) => {
    const { build, output, restored } = fixture();
    writeFileSync(join(build, 'client/assets/app.js'), 'export {};');
    writeFileSync(join(build, 'client/assets/app.js.map'), map('app.js'));
    writeFileSync(join(build, 'client', file), String.raw`{"url":"/assets/\u0061pp.js.map"}`);
    packServeUiLayer(build, output);
    extract(join(output, 'serve-ui-client.tar.gz'), restored);
    expect(readFileSync(join(restored, 'client/assets/app.js.map'), 'utf8')).toBe(map('app.js'));
  });

  it('should refuse client and output symlinks without changing the build', () => {
    const { build, output } = fixture();
    symlinkSync(join(build, 'client'), output);
    expect(() => {
      packServeUiLayer(build, output);
    }).toThrow('outside the client build');
    expect(readdirSync(join(build, 'client'))).toEqual(['assets', 'index.html']);
    const linkedBuild = join(build, 'linked');
    mkdirSync(linkedBuild);
    symlinkSync(join(build, 'client'), join(linkedBuild, 'client'));
    expect(() => {
      packServeUiLayer(linkedBuild, join(build, 'other-output'));
    }).toThrow('ordinary directory');
  });

  it.each(['symlink', 'hardlink'])('should replace %s output entries without mutating source bytes', (kind) => {
    const { build, output } = fixture();
    const source = join(build, 'client/assets/app.js');
    const original = 'export const untouched = true;';
    writeFileSync(source, original);
    mkdirSync(output);
    for (const name of ['serve-ui-client.members', 'serve-ui-client.tar.gz', 'serve-ui-layer-manifest.json']) {
      if (kind === 'symlink') {
        symlinkSync(source, join(output, name));
      } else {
        linkSync(source, join(output, name));
      }
    }
    packServeUiLayer(build, output);
    expect(readFileSync(source, 'utf8')).toBe(original);
  });

  it('should retain manifest-referenced, malformed and incomplete debug maps', () => {
    const { build, output, restored } = fixture();
    for (const file of ['app', 'broken', 'external']) {
      writeFileSync(join(build, `client/assets/${file}.js`), 'export {};');
    }
    writeFileSync(join(build, 'client/manifest.json'), JSON.stringify({ asset: '/assets/app.js.map' }));
    writeFileSync(join(build, 'client/assets/app.js.map'), map('app.js'));
    writeFileSync(join(build, 'client/assets/broken.js.map'), 'not JSON');
    writeFileSync(
      join(build, 'client/assets/external.js.map'),
      JSON.stringify({ version: 3, file: 'external.js', sources: ['remote.ts'], mappings: 'AAAA' }),
    );
    packServeUiLayer(build, output);
    extract(join(output, 'serve-ui-client.tar.gz'), restored);
    for (const file of ['app', 'broken', 'external']) {
      expect(readFileSync(join(restored, `client/assets/${file}.js.map`))).toEqual(
        readFileSync(join(build, `client/assets/${file}.js.map`)),
      );
    }
  });
});
