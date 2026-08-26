import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const packageVersion = (root: string, packageName: string): string => {
  const packageJson: unknown = JSON.parse(
    readFileSync(join(root, 'node_modules', packageName, 'package.json'), 'utf8'),
  );
  if (!packageJson || typeof packageJson !== 'object' || !('version' in packageJson)) {
    throw new TypeError(`${packageName} package.json does not declare a version`);
  }
  return String(packageJson.version);
};
