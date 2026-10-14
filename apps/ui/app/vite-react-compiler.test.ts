// @vitest-environment node
import { createRequire } from 'node:module';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { createElement } from 'react';
import type { ComponentProps, ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { build } from 'vite';
// oxlint-disable-next-line no-restricted-imports -- exercises the production client compiler configuration.
import { createUiReactCompilerPlugin, createUiSourceAliasPlugin } from '../vite.config.js';
import type { MonthlyCreditsMeter, MonthlyCreditsMeterState } from '#components/billing/monthly-credits-meter.js';

const require = createRequire(import.meta.url);
const appRoot = import.meta.dirname;

/** Build through the client pipeline, then execute its CommonJS output with real React. */
const buildClientModule = async <Props extends Record<string, unknown>>(
  source: string,
): Promise<Record<string, ComponentType<Props>>> => {
  const entry = path.join(appRoot, 'credits-compiler-fixture.tsx');
  const result = await build({
    configFile: false,
    root: path.resolve(appRoot, '..'),
    logLevel: 'silent',
    plugins: [
      {
        name: 'credits-compiler-fixture',
        load(id) {
          return id === entry ? source : null;
        },
        resolveId(id) {
          return id === entry ? entry : null;
        },
      },
      createUiSourceAliasPlugin(),
      createUiReactCompilerPlugin(),
    ],
    build: {
      write: false,
      target: 'es2022',
      minify: true,
      lib: { entry, formats: ['cjs'] },
      rolldownOptions: { external: [/^react(?:-dom)?(?:\/|$)/u] },
    },
  });
  const bundle = Array.isArray(result) ? result[0] : result;
  if (!bundle || !('output' in bundle)) {
    throw new Error('Expected a single client bundle');
  }
  const chunk = bundle.output.find((output) => output.type === 'chunk' && output.isEntry);
  if (chunk?.type !== 'chunk') {
    throw new Error('Expected an entry chunk');
  }
  const exports = {};
  runInNewContext(chunk.code, { exports, require });
  return exports;
};

describe('production React compiler', () => {
  it('should render the monthly credits meter with BigInt balances after a client build', async () => {
    const built = await buildClientModule<ComponentProps<typeof MonthlyCreditsMeter>>(
      `import { MonthlyCreditsMeter as Meter } from '#components/billing/monthly-credits-meter.js';
       import { TooltipProvider } from '@taucad/ui/components/tooltip';
       export function MonthlyCreditsMeter(props) {
         return <TooltipProvider><Meter {...props} /></TooltipProvider>;
       }`,
    );
    const { MonthlyCreditsMeter: meterComponent } = built;
    if (!meterComponent) {
      throw new Error('Missing monthly credits meter');
    }
    const state: MonthlyCreditsMeterState = {
      status: 'ready',
      monthly: { availableCreditAtoms: 1400n, scaleCreditAtoms: 2000n, fraction: 0.7 },
    };
    expect(renderToStaticMarkup(createElement(meterComponent, { state }))).toContain('70% left');
    expect(
      renderToStaticMarkup(
        createElement(meterComponent, {
          state: { status: 'ready', monthly: { availableCreditAtoms: 1n, scaleCreditAtoms: 2000n, fraction: 0.0005 } },
        }),
      ),
    ).toContain('&lt;1% left');
    expect(
      renderToStaticMarkup(
        createElement(meterComponent, {
          state: { status: 'ready', monthly: { availableCreditAtoms: 1n, scaleCreditAtoms: 0n, fraction: 0 } },
        }),
      ),
    ).toContain('Custom allowance');
  });

  it.each(['100n', '1_00n', '0x64n', '0X64n', '0o144n', '0O144n', '0b1100100n', '0B1100100n'])(
    'should preserve arithmetic and default values with %s in compiled components',
    async (literal) => {
      const built = await buildClientModule<{ balance: bigint }>(`
        export function Credits({ balance, multiplier = ${literal} }) {
          return <span>{String(balance * multiplier)}</span>;
        }
      `);
      const { Credits: creditsComponent } = built;
      if (!creditsComponent) {
        throw new Error('Missing credits component');
      }
      expect(renderToStaticMarkup(createElement(creditsComponent, { balance: 7n }))).toBe('<span>700</span>');
    },
  );
});
