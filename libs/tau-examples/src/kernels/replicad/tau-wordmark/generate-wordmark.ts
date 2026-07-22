import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import openCascade from 'replicad-opencascadejs';
import { setOC } from 'replicad';
import { createTauWordmark } from '#kernels/replicad/tau-wordmark/main.js';

setOC(await openCascade());

const formatPath = (path: string): string =>
  path.replaceAll(/-?\d+(?:\.\d+)?/g, (value) =>
    String(Number(Number(value).toFixed(5))),
  );

const paths = createTauWordmark()
  .toSVGPaths()
  .flat()
  .map((path) => formatPath(path));
const pathData = paths.join(' ');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3160 1187.71"><path fill="#008f7b" fill-rule="evenodd" d="${pathData}"/></svg>\n`;
const component = `export function TauWordmark(properties: React.SVGProps<SVGSVGElement>): React.JSX.Element {
  return (
    <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 3160 1187.71' {...properties}>
      <path
        fill='currentColor'
        fillRule='evenodd'
        d='${pathData}'
      />
    </svg>
  );
}
`;

const directory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = join(directory, '../../../../../..');
const outputs = [
  [join(directory, 'wordmark.svg'), svg],
  [
    join(workspaceRoot, 'apps/ui/app/components/icons/tau-wordmark.tsx'),
    component,
  ],
] as const;

if (process.argv.includes('--check')) {
  for (const [output, expected] of outputs) {
    if (readFileSync(output, 'utf8') !== expected) {
      throw new Error(`Generated wordmark differs: ${output}`);
    }
  }
} else {
  for (const [output, contents] of outputs) {
    writeFileSync(output, contents);
  }
}
