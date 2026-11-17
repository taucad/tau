// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { edgeShellClasses, shellDocumentFile } from '#lib/route-classes.js';
import { placeEdgeShells } from '#scripts/place-static-shells.ts';

let client: string;

const write = (file: string, text: string): void => {
  mkdirSync(dirname(join(client, file)), { recursive: true });
  writeFileSync(join(client, file), text);
};

beforeEach(() => {
  client = mkdtempSync(join(tmpdir(), 'place-static-shells-'));
});

afterEach(() => {
  rmSync(client, { recursive: true, force: true });
});

describe('placeEdgeShells', () => {
  it("should move the Home shell off `/`'s static path and drop its prerendered data", () => {
    const [home] = edgeShellClasses;
    write('index.html', '<!DOCTYPE html><title>Home</title>');
    write('_root.data', '[{"_1":2}]');
    write('w/__shell/__shell/index.html', '<!DOCTYPE html><title>Project</title>');
    write('w/__shell/__shell.data', '[]');

    const placed = placeEdgeShells(client);

    expect(home).toBeDefined();
    const document = home === undefined ? '' : shellDocumentFile(home);
    expect(placed).toStrictEqual([{ from: 'index.html', to: document, removed: ['_root.data'] }]);
    expect(readFileSync(join(client, document), 'utf8')).toBe('<!DOCTYPE html><title>Home</title>');
    // Netlify's function yields to a static file (`preferStatic`): none may remain for `/` or `/_root.data`.
    expect(existsSync(join(client, 'index.html'))).toBe(false);
    expect(existsSync(join(client, '_root.data'))).toBe(false);
    // A rewrite shell is served from its prerendered file and is left as the prerender wrote it.
    expect(existsSync(join(client, 'w/__shell/__shell/index.html'))).toBe(true);
    expect(existsSync(join(client, 'w/__shell/__shell.data'))).toBe(true);
  });

  it("should drop React Router 8's trailing-slash-aware data file too", () => {
    write('index.html', 'home');
    write('_.data', '[]');
    expect(placeEdgeShells(client)[0]?.removed).toStrictEqual(['_.data']);
    expect(existsSync(join(client, '_.data'))).toBe(false);
  });

  it('should fail the build when the prerender wrote no shell', () => {
    expect(() => placeEdgeShells(client)).toThrow(/Home: the prerender wrote no index\.html/u);
  });
});
