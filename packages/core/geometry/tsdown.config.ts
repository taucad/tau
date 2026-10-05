import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { bundlePattern, workspace } from '@taucad/nx';
import { assembleBundledDeclarations } from '@taucad/nx/bundled-declarations';
import { defineConfig } from 'tsdown';
import type { UserConfig } from 'tsdown';

// oxlint-disable-next-line typescript/no-restricted-types -- Serialized JSON includes the null primitive.
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/**
 * Preserve the JSON module's structural type without another authored schema source.
 * @param value - A value parsed from the owned JSON schema.
 * @returns Its TypeScript structural type.
 */
const jsonType = (value: JsonValue): string => {
  if (Array.isArray(value)) {
    return `Array<${[...new Set(value.map((entry) => jsonType(entry)))].join(' | ') || 'never'}>`;
  }
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'object') {
    return `{ ${Object.entries(value)
      .map(([key, child]) => `${JSON.stringify(key)}: ${jsonType(child)}`)
      .join('; ')} }`;
  }
  return typeof value;
};

const baseConfig: UserConfig = {
  entry: ['src/index.ts'],
  sourcemap: false,
  clean: true,
  dts: { eager: true },
  minify: true,
  hooks: {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- tsdown's hook API uses colon-delimited names.
    'build:done': async ({ options }) => {
      const schema = JSON.parse(await readFile('schema/tau-cad-topology.schema.json', 'utf8')) as JsonValue;
      await writeFile(
        resolve('schema/tau-cad-topology.schema.d.cts'),
        `// Generated from schema/tau-cad-topology.schema.json during the geometry-core build.\ndeclare const schema: ${jsonType(schema)};\nexport = schema;\n`,
      );
      await assembleBundledDeclarations(process.cwd(), options.outDir, 'geometry-core');
    },
  },
  tsconfig: 'tsconfig.build.json',
  unbundle: true,
};

export default defineConfig(async () => {
  const pattern = bundlePattern(await workspace(), 'geometry-core');
  return {
    ...baseConfig,
    format: 'esm',
    outDir: 'dist',
    deps: { alwaysBundle: [pattern], dts: { neverBundle: [pattern] } },
  } satisfies UserConfig;
});
