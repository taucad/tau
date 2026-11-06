/**
 * Delta chain depth of a pack, measured from its `.idx` and its entries'
 * headers only: how many Range waves a cold open pays per object (W5).
 *
 * Not a test: a node tool for hosted packs. Each entry's header and base
 * field are read (a few dozen bytes each, coalesced into large reads when the
 * pack is local), never inflated, and each object's depth is the number of
 * delta hops to a whole entry. The report is a histogram, so it can be put
 * beside the D8 budget of one wave per hop.
 *
 * Run from `packages/revisions`, over a local pack and its index:
 * `node --import @oxc-node/core/register src/test/chain-depth-profile.ts <pack> <idx>`
 * or over files links (Range-capable):
 * `node --import @oxc-node/core/register src/test/chain-depth-profile.ts --pack-url=<href> --index-url=<href> --pack-bytes=<n>`
 *
 * @internal
 */

import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { readPackIndex } from '#pack-reader/pack-index.js';
import type { PackIndex } from '#pack-reader/pack-index.js';
import { deltaBaseOf } from '#pack-reader/pack-reader.js';

/** One pack's delta chain depths. */
export type ChainDepthProfile = Readonly<{
  objects: number;
  /** Objects stored whole: depth 0. */
  whole: number;
  maximum: number;
  /** Depth at or under which 95 % of objects sit. */
  p95: number;
  mean: number;
  /** Objects per depth. */
  histogram: ReadonlyMap<number, number>;
}>;

/** The bytes of an entry's header and base field never exceed this. */
const headBytes = 32;

/**
 * Profile a pack's delta chains.
 *
 * @param index - The pack's index tables.
 * @param packBytes - The pack's size.
 * @param readHead - Up to {@link headBytes} bytes from an entry's start.
 * @returns The depth of every object, summarized.
 */
export const profileChainDepth = async (
  index: PackIndex,
  packBytes: number,
  readHead: (offset: number, length: number) => Promise<Uint8Array<ArrayBuffer>>,
): Promise<ChainDepthProfile> => {
  const offsets = [...index.entries()].map(([, offset]) => offset);
  const baseOf = new Map<number, number | undefined>();
  await Promise.all(
    offsets.map(async (offset) => {
      const length = Math.min(headBytes, index.endOf(offset, packBytes) - offset);
      const base = deltaBaseOf(await readHead(offset, length), offset);
      baseOf.set(offset, base === undefined ? undefined : 'offset' in base ? base.offset : index.offsetOf(base.oid));
    }),
  );
  const depthOf = new Map<number, number>();
  const depth = (offset: number): number => {
    const chain: number[] = [];
    let at: number | undefined = offset;
    while (at !== undefined && !depthOf.has(at)) {
      chain.push(at);
      at = baseOf.get(at);
    }
    let known = at === undefined ? -1 : depthOf.get(at)!;
    for (const link of chain.toReversed()) {
      known += 1;
      depthOf.set(link, known);
    }
    return depthOf.get(offset)!;
  };
  const depths = offsets.map((offset) => depth(offset)).toSorted((left, right) => left - right);
  const histogram = new Map<number, number>();
  for (const value of depths) {
    histogram.set(value, (histogram.get(value) ?? 0) + 1);
  }
  return {
    objects: depths.length,
    whole: histogram.get(0) ?? 0,
    maximum: depths.at(-1) ?? 0,
    p95: depths[Math.max(0, Math.ceil(depths.length * 0.95) - 1)] ?? 0,
    mean: depths.length === 0 ? 0 : depths.reduce((sum, value) => sum + value, 0) / depths.length,
    histogram,
  };
};

const argumentOf = (name: string): string | undefined =>
  process.argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3);

const main = async (): Promise<void> => {
  const packUrl = argumentOf('pack-url');
  let index: PackIndex;
  let packBytes: number;
  let readHead: (offset: number, length: number) => Promise<Uint8Array<ArrayBuffer>>;
  if (packUrl === undefined) {
    const [packPath, indexPath] = process.argv.slice(2).filter((argument) => !argument.startsWith('--'));
    if (packPath === undefined || indexPath === undefined) {
      throw new Error('Name a pack and its index, or --pack-url, --index-url and --pack-bytes.');
    }
    const pack = new Uint8Array(await readFile(packPath));
    index = readPackIndex(new Uint8Array(await readFile(indexPath)));
    packBytes = pack.byteLength;
    readHead = async (offset, length) => pack.slice(offset, offset + length);
  } else {
    const indexUrl = argumentOf('index-url');
    packBytes = Number(argumentOf('pack-bytes'));
    if (indexUrl === undefined || !Number.isSafeInteger(packBytes)) {
      throw new Error('--pack-url needs --index-url and --pack-bytes.');
    }
    const indexResponse = await fetch(indexUrl);
    index = readPackIndex(new Uint8Array(await indexResponse.arrayBuffer()));
    readHead = async (offset, length) => {
      const response = await fetch(packUrl, {
        headers: { range: `bytes=${String(offset)}-${String(offset + length - 1)}` },
      });
      if (response.status !== 206) {
        throw new Error(`The pack answered ${String(response.status)} to a Range read.`);
      }
      return new Uint8Array(await response.arrayBuffer());
    };
  }
  const profile = await profileChainDepth(index, packBytes, readHead);
  console.log(
    JSON.stringify(
      { ...profile, mean: Number(profile.mean.toFixed(2)), histogram: Object.fromEntries(profile.histogram) },
      undefined,
      2,
    ),
  );
};

if (process.argv[1]?.endsWith('chain-depth-profile.ts') === true) {
  await main();
}
