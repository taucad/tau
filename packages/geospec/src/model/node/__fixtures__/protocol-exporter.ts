// A subprocess protocol 1 exporter for tests. GEOSPEC_FIXTURE_MODE selects the response it gives.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

const args = process.argv.slice(2);
const value = (flag: string): string | undefined => {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
};
const out = value('--out') ?? '.';
const print = (document: unknown): void => {
  process.stdout.write(JSON.stringify(document));
};

const { GEOSPEC_FIXTURE_MODE: mode, GEOSPEC_FIXTURE_PID_FILE: pidFile } = process.env;

switch (mode) {
  case 'refuse': {
    print({ protocol: 1, error: { code: 'FIXTURE_REFUSED', message: 'The fixture refused.', suggestion: 'Do not.' } });
    process.exitCode = 2;
    break;
  }
  case 'garbage': {
    process.stdout.write('not json');
    process.stderr.write('fixture stderr');
    process.exitCode = 3;
    break;
  }
  case 'stubborn': {
    process.on('SIGTERM', () => undefined);
    writeFileSync(pidFile ?? join(out, 'pid'), String(process.pid));
    setTimeout(() => undefined, 60_000);
    break;
  }
  case 'hang': {
    setTimeout(() => undefined, 60_000);
    break;
  }
  case 'escape': {
    print({ protocol: 1, format: 'glb', primary: '../outside.glb', consumedSources: [] });
    break;
  }
  default: {
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, 'model.glb'), Uint8Array.of(1, 2, 3));
    writeFileSync(join(out, 'texture.png'), Uint8Array.of(9));
    print({
      protocol: 1,
      format: value('--format'),
      sourceUnit: 'mm',
      primary: 'model.glb',
      resources: [{ name: 'texture.png', path: 'texture.png' }],
      consumedSources: [
        { path: value('--file'), sha256: 'b'.repeat(64) },
        { path: 'echo', sha256: JSON.stringify(args) },
      ],
    });
  }
}
