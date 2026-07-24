import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import process from 'node:process';
import { afterEach, describe, expect, it } from 'vitest';

import { convertLatexArtifact, readLatexArtifact, validateLatexArtifact } from '#text-to-md.js';

const originalPath = process.env['PATH'];
const temporaryDirectories: string[] = [];

afterEach(() => {
  if (originalPath === undefined) {
    delete process.env['PATH'];
  } else {
    process.env['PATH'] = originalPath;
  }
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const temporaryFile = (contents: string | Uint8Array<ArrayBuffer>, extension = '.tex'): string => {
  const directory = mkdtempSync(join(tmpdir(), 'tau-latex-test-'));
  temporaryDirectories.push(directory);
  const path = join(directory, `paper${extension}`);
  writeFileSync(path, contents);
  return path;
};

const installFakePandoc = (version = '3.10.0'): void => {
  const directory = mkdtempSync(join(tmpdir(), 'tau-fake-pandoc-'));
  temporaryDirectories.push(directory);
  const executable = join(directory, 'pandoc');
  writeFileSync(
    executable,
    `#!${process.execPath}
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--version') {
  process.stdout.write('pandoc ${version}\\n');
} else {
  const expected = ['+RTS', '-M512M', '-RTS', '--sandbox', '--fail-if-warnings', '--from=latex', '--to=gfm-raw_html', '--wrap=none'];
  if (JSON.stringify(args) !== JSON.stringify(expected)) process.exit(9);
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', () => process.stdout.write('# Converted\\n\\n' + input));
}
`,
  );
  chmodSync(executable, 0o755);
  process.env['PATH'] = `${directory}${delimiter}${originalPath ?? ''}`;
};

describe('readLatexArtifact', () => {
  it('should accept direct UTF-8 LaTeX and reject binary controls or archives', async () => {
    const valid = temporaryFile('\\section{Result}\nEvidence');
    expect(readLatexArtifact(valid)).toContain('Evidence');
    await expect(validateLatexArtifact(valid)).resolves.toBeUndefined();
    expect(() => readLatexArtifact(temporaryFile('bad\0text'))).toThrow('forbidden control characters');
    expect(() => readLatexArtifact(temporaryFile(Buffer.from([0x50, 0x4b, 0x03, 0x04])))).toThrow('direct text file');
    const tar = new Uint8Array(new ArrayBuffer(512));
    tar.set(new TextEncoder().encode('ustar'), 257);
    expect(() => readLatexArtifact(temporaryFile(tar))).toThrow('direct text file');
  });
});

describe('convertLatexArtifact', () => {
  it('should invoke Pandoc through the fixed sandboxed stdin contract', async () => {
    installFakePandoc();
    const result = await convertLatexArtifact(temporaryFile('\\section{Result}\nEvidence'));
    expect(result.markdown).toContain('# Converted');
    expect(result.markdown).toContain('Evidence');
    expect(result.detail).toBe('sandboxed Pandoc LaTeX conversion');
  });

  it('should reject Pandoc versions older than the security baseline', async () => {
    installFakePandoc('3.1.3');
    await expect(convertLatexArtifact(temporaryFile('Evidence'))).rejects.toThrow('3.1.4 or newer');
  });

  const smoke = process.env['PANDOC_SMOKE'] === '1' ? it : it.skip;
  smoke('should convert a real direct LaTeX document with the installed Pandoc', async () => {
    const result = await convertLatexArtifact(
      temporaryFile('\\section{Result}\nA constrained real Pandoc conversion.'),
    );
    expect(result.markdown).toContain('Result');
    expect(result.markdown).toContain('constrained real Pandoc conversion');
  });

  smoke('should reject a LaTeX include-file exfiltration attempt', async () => {
    await expect(convertLatexArtifact(temporaryFile(String.raw`\input{/etc/hosts}`))).rejects.toThrow();
  });
});
