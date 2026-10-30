import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The manifest names every staged file's SHA-256, so its own hash identifies the whole bundle.
const manifest = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../out/csharp-language/stage/assets-manifest.json',
);
process.stdout.write(
  existsSync(manifest) ? `${createHash('sha256').update(readFileSync(manifest)).digest('hex')}\n` : 'none\n',
);
