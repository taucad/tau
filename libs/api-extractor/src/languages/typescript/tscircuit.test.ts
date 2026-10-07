import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { byTscircuitGroup, extractTscircuitApi, loadTscircuitCorpus } from '#languages/typescript/tscircuit.js';
import type { ApiEntry } from '#model/api-corpus.types.js';

const propsSource = `import { z } from 'zod';
interface PcbLayoutProps { pcbX?: string | number; pcbY?: string | number; layer?: string; }
interface CommonLayoutProps { pcbX?: string | number; pcbY?: string | number; layer?: string; schX?: string | number; footprint?: string; }
interface CommonComponentProps<PinLabel extends string = string> extends CommonLayoutProps {
  key?: any;
  name: string;
  /** @deprecated Use name. */
  legacyName?: string;
}
interface BaseGroupProps extends CommonLayoutProps { width?: number; height?: number; children?: any; }
interface SubcircuitGroupProps extends BaseGroupProps { subcircuit?: boolean; connections?: Record<string, string>; }
interface PinSideDefinition {
  pins: Array<number | string>;
  direction: "top-to-bottom" | "left-to-right";
}
type PinSideDefinitionInput = PinSideDefinition | Array<number | string>;
interface SchematicPortArrangement { leftSide?: PinSideDefinitionInput; }
interface ResistorProps<PinLabel extends string = string> extends CommonComponentProps<PinLabel> {
  /** Resistance, e.g. "10k". */
  resistance: number | string;
  _internal?: boolean;
}
interface ChipProps extends CommonComponentProps {
  schPinArrangement?: SchematicPortArrangement;
}
interface BoardProps extends Omit<SubcircuitGroupProps, "connections"> { title?: string; }
declare const ledProps: z.ZodObject<{ color: z.ZodOptional<z.ZodString> }, "strip", z.ZodTypeAny, { color?: string | undefined }, { color?: string | undefined }>;
type LedProps = CommonComponentProps & z.input<typeof ledProps>;
type TraceProps = { from: string; to: string; width?: number } | { path: string[]; width?: number };
export type { BaseGroupProps, BoardProps, ChipProps, CommonComponentProps, CommonLayoutProps, LedProps, PcbLayoutProps, ResistorProps, SubcircuitGroupProps, TraceProps };
`;

const zodSource = `export declare namespace z {
  type ZodTypeAny = { _input: unknown };
  type ZodString = { _input: string };
  type ZodOptional<T extends ZodTypeAny> = { _input: T['_input'] | undefined };
  type ZodObject<Shape, Mode, Catchall, Output, Input> = { _input: Input };
  type input<T extends { _input: unknown }> = T['_input'];
}
`;

const coreSource = `import * as _tscircuit_props from '@tscircuit/props';
interface TscircuitElements {
  resistor: _tscircuit_props.ResistorProps;
  chip: _tscircuit_props.ChipProps;
  bug: _tscircuit_props.ChipProps;
  board: _tscircuit_props.BoardProps;
  led: _tscircuit_props.LedProps;
  trace: _tscircuit_props.TraceProps;
  custom: any;
}
/** Build a selector. */
declare const sel: (refdes: string) => Record<string, string>;
declare const useResistor: (name: string) => unknown;
export { sel, useResistor };
`;

const footprinterSource = `type FootprinterParamsBuilder<K extends string> = Record<K, (value: number) => unknown>;
type Footprinter = {
  soic: (num_pins?: number) => FootprinterParamsBuilder<"w" | "p">;
  res: () => FootprinterParamsBuilder<"imperial">;
};
export type { Footprinter };
`;

describe('extractTscircuitApi over a fixture', () => {
  const root = mkdtempSync(join(tmpdir(), 'tau-tscircuit-fixture-'));
  const write = (path: string, content: string): string => {
    const file = join(root, 'node_modules', path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
    return file;
  };
  write('zod/index.d.ts', zodSource);
  write('@tscircuit/props/package.json', JSON.stringify({ types: 'dist/index.d.ts' }));
  write('@tscircuit/props/dist/index.d.ts', propsSource);
  const corpus = extractTscircuitApi({
    coreDeclarations: write('@tscircuit/core/dist/index.d.ts', coreSource),
    footprinterDeclarations: write('@tscircuit/footprinter/dist/index.d.ts', footprinterSource),
    packageVersion: '0.0.1',
  });
  const entry = (name: string): ApiEntry | undefined => corpus.entries.find((candidate) => candidate.name === name);
  const memberNames = (name: string): readonly string[] | undefined =>
    entry(name)?.members?.map((member) => member.name);

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('should name each intrinsic element by its JSX tag and skip untyped ones', () => {
    expect(
      corpus.entries.filter((candidate) => candidate.name.startsWith('<')).map((candidate) => candidate.name),
    ).toEqual(['<resistor>', '<chip>', '<board>', '<led>', '<trace>', '<bug>']);
    expect(entry('<resistor>')?.type?.text).toBe('ResistorProps extends CommonComponentProps');
    expect(entry('<resistor>')?.docs?.summary).toBe(
      'JSX element <resistor> with ResistorProps, required resistance, name',
    );
    expect(entry('<bug>')?.docs?.summary).toBe('Same props as <chip>');
    expect(entry('<bug>')?.members).toBeUndefined();
  });

  it('should list only the props an element adds over its shared base', () => {
    expect(memberNames('<resistor>')).toEqual(['resistance']);
    expect(memberNames('CommonComponentProps')).toEqual(['name']);
    expect(entry('CommonComponentProps')?.type?.text).toBe('interface CommonComponentProps extends CommonLayoutProps');
    expect(entry('<board>')?.type?.text).toBe('BoardProps extends Omit<SubcircuitGroupProps, "connections">');
  });

  it('should print a schema-derived prop as its resolved type', () => {
    expect(entry('<led>')?.members?.find((member) => member.name === 'color')?.type?.text).toBe('string');
  });

  it("should list every variant's props for a union of prop shapes", () => {
    expect(memberNames('<trace>')).toEqual(['from', 'to', 'width', 'path']);
  });

  it('should follow referenced prop types and state their required keys', () => {
    expect(entry('PinSideDefinition')?.docs?.summary).toBe('Required pins, direction');
    expect(entry('PinSideDefinitionInput')?.type?.text).toBe('PinSideDefinition | Array<number | string>');
  });

  it('should carry footprint functions and helpers', () => {
    expect(memberNames('footprint strings')).toEqual(['soic', 'res']);
    expect(entry('sel')?.signatures?.[0]?.text).toBe(
      'export declare function sel(refdes: string): Record<string, string>;',
    );
    expect(
      corpus.entries.filter((candidate) => candidate.category === 'Helpers').map((candidate) => candidate.name),
    ).toEqual(['sel', 'useResistor']);
  });
});

describe('committed tscircuit corpus', () => {
  const corpus = loadTscircuitCorpus();
  const entry = (name: string): ApiEntry | undefined => corpus.entries.find((candidate) => candidate.name === name);

  it('should match the @tscircuit/core the plugin resolves', () => {
    const core = join(import.meta.dirname, '../../../../../packages/plugins/tscircuit/node_modules/@tscircuit/core');
    if (!existsSync(core)) {
      return;
    }
    const { version } = JSON.parse(readFileSync(join(realpathSync(core), 'package.json'), 'utf8')) as {
      version: string;
    };
    // A catalog bump re-runs `nx run api-extractor:extract-tscircuit`.
    expect(corpus.metadata.packageVersion).toBe(version);
  });

  it('should carry the core section pins with the props agents get wrong', () => {
    for (const tag of ['<board>', '<chip>', '<resistor>', '<capacitor>', '<trace>']) {
      expect(entry(tag)?.members?.length ?? 0).toBeGreaterThan(0);
    }
    expect(entry('<trace>')?.members?.map((member) => member.name)).toEqual(expect.arrayContaining(['from', 'to']));
    expect(entry('<chip>')?.members?.map((member) => member.name)).toContain('schPinArrangement');
    expect(entry('PinSideDefinition')?.docs?.summary).toBe('Required pins, direction');
    expect(entry('CadModelProp')).toBeDefined();
  });

  it('should group every entry under a named category', () => {
    expect(new Set(corpus.entries.map((candidate) => byTscircuitGroup(candidate)))).toEqual(
      new Set([
        'Components',
        'Boards, groups and layout',
        'Schematic drawing',
        'PCB, footprint and CAD primitives',
        'Connectivity',
        'Simulation',
        'Shared props',
        'Prop types',
        'Footprint strings',
        'Helpers',
      ]),
    );
  });
});
