import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// The manifest names every staged file's SHA-256, so its own hash identifies the whole bundle.
const stage = process.env['TAU_CSHARP_LANGUAGE_STAGE'];
process.stdout.write(
  stage
    ? `${createHash('sha256')
        .update(readFileSync(path.join(stage, 'assets-manifest.json')))
        .digest('hex')}\n`
    : 'none\n',
);
