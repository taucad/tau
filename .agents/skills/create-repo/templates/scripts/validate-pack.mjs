import { execFileSync } from 'node:child_process';

import { validatePackageFiles } from './package-files.mjs';

const packed = JSON.parse(
  execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { encoding: 'utf8' }),
);
if (!Array.isArray(packed) || packed.length !== 1) {
  throw new Error('npm pack must describe exactly one tarball');
}

const files = validatePackageFiles(packed[0].files.map(({ path }) => path));
console.log(`npm package contains ${files.length} files within the enforced ceiling`);
