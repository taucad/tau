/**
 * The History branch graph's renderer (History D2): one SVG laid over the list
 * it describes, drawn from {@link graphGeometry}. Bends first, rails over them,
 * markers on top, so a bend passes under any lane it crosses.
 *
 * Colour comes from tokens only: `main` is the foreground colour and every
 * other line takes a `--branch-*` slot (D5). Colour is never the only cue
 * (invariant I10): each branch also has its name on a chip, its own column and
 * a swatch with its own shape.
 */
import { createContext, useLayoutEffect, useState } from 'react';
import type { RefObject } from 'react';
import { cn } from '@taucad/ui/utils/cn';
import type { GeometryMarker, GraphGeometry, RowBox } from '#components/revisions/revision-graph-layout.js';

/**
 * Whether the rows below draw on the graph's lanes. Inside it a row draws no
 * marker and no line of its own: the graph draws them in the gutter it leaves.
 */
export const HistoryLanesContext = createContext(false);

/** A line's colour and swatch shape: 0 is `main`, 1 to 4 the `--branch-*` slots. */
export type BranchSlot = 0 | 1 | 2 | 3 | 4;

const tones = ['text-foreground', 'text-branch-1', 'text-branch-2', 'text-branch-3', 'text-branch-4'] as const;

/**
 * The text colour class of a slot, for `fill-current` and `stroke-current`.
 *
 * @param slot - The line's slot.
 * @returns A Tailwind text colour class.
 */
export const branchTone = (slot: BranchSlot | undefined): string => tones[slot ?? 0];

/*
 * ponytail: any stable hash keeps a branch's colour on every device. This polynomial one's basis and
 * multiplier keep the review canvas's colours for its example branches (enclosure-v2 blue, thermal-test green).
 */
const slotHash = (name: string): number => {
  let hash = 10;
  for (const character of name) {
    hash = (hash * 21 + (character.codePointAt(0) ?? 0)) % 1_000_003;
  }
  return hash % 4;
};

/**
 * Each line's slot. No colour is stored: a line takes the slot its name hashes
 * to, or the next free one when an earlier line holds it. The first line is
 * `main` and takes the foreground colour; past four other lines slots repeat.
 *
 * @param lines - The lines in view, `main` first, the rest in a stable order.
 * @returns Each line's slot.
 */
export const branchSlotsOf = (lines: readonly string[]): ReadonlyMap<string, BranchSlot> => {
  const slots = new Map<string, BranchSlot>();
  const taken = new Set<number>();
  for (const [position, line] of lines.entries()) {
    if (position === 0) {
      slots.set(line, 0);
      continue;
    }
    if (taken.size === 4) {
      taken.clear();
    }
    let slot = slotHash(line);
    for (let step = 0; step < 4 && taken.has(slot); step += 1) {
      slot = (slot + 1) % 4;
    }
    taken.add(slot);
    slots.set(line, (slot + 1) as BranchSlot);
  }
  return slots;
};

const swatchShapes = [
  <circle key='circle' cx='5' cy='5' r='4' />,
  <path key='diamond' d='M5 0 10 5 5 10 0 5Z' />,
  <rect key='square' x='1' y='1' width='8' height='8' rx='1' />,
  <path key='triangle' d='M5 0.5 10 9.5H0Z' />,
  <path key='hexagon' d='M2.5 0.5h5L10 5 7.5 9.5h-5L0 5Z' />,
] as const;

/**
 * A branch's swatch: its colour and a shape of its own (circle, diamond,
 * square, triangle, hexagon), so colour is never the only cue.
 *
 * @param props - The branch's slot.
 * @returns A decorative SVG.
 */
export function BranchSwatch({
  slot,
  className,
}: {
  readonly slot: BranchSlot | undefined;
  readonly className?: string;
}): React.JSX.Element {
  return (
    <svg
      aria-hidden
      viewBox='0 0 10 10'
      data-slot='branch-swatch'
      data-branch-slot={slot ?? 0}
      className={cn('size-2 shrink-0 fill-current', branchTone(slot), className)}
    >
      {swatchShapes[slot ?? 0]}
    </svg>
  );
}

/**
 * Each graph row's top and height inside `frame`, kept current as rows open,
 * close and wrap. A row is the element `[data-graph-key]` or
 * `[data-revision-row]` names by its key.
 *
 * @param frame - The element the graph is drawn over.
 * @param keys - The graph rows' keys, in order.
 * @returns One box per key, or none until every row is in the document.
 */
export const useRowBoxes = (
  // oxlint-disable-next-line typescript/no-restricted-types -- React ref object
  frame: RefObject<HTMLElement | null>,
  keys: readonly string[],
): readonly RowBox[] => {
  const [boxes, setBoxes] = useState<readonly RowBox[]>([]);
  /* One string for the effect to depend on: the caller builds `keys` afresh every render. Keys never hold a newline. */
  const signature = keys.join('\n');
  useLayoutEffect(() => {
    const element = frame.current;
    const wanted = signature === '' ? [] : signature.split('\n');
    if (element === null || wanted.length === 0) {
      return undefined;
    }
    const rowOf = (key: string): HTMLElement | undefined =>
      element.querySelector<HTMLElement>(`[data-graph-key="${CSS.escape(key)}"]`) ??
      element.querySelector<HTMLElement>(`[data-revision-row="${CSS.escape(key)}"]`) ??
      undefined;
    const measure = (): void => {
      const origin = element.getBoundingClientRect().top;
      const next: RowBox[] = [];
      for (const key of wanted) {
        const row = rowOf(key);
        if (row === undefined) {
          return;
        }
        const box = row.getBoundingClientRect();
        next.push({ top: Math.round(box.top - origin), height: Math.round(box.height) });
      }
      setBoxes((current) =>
        current.length === next.length &&
        current.every((box, index) => {
          const other = next[index];
          return box.top === other?.top && box.height === other.height;
        })
          ? current
          : next,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    for (const key of wanted) {
      const row = rowOf(key);
      if (row !== undefined) {
        observer.observe(row);
      }
    }
    return () => {
      observer.disconnect();
    };
  }, [frame, signature]);
  return boxes;
};

const dashes = { solid: undefined, dashed: '4 3', fade: '1.5 3' } as const;

function Marker({ marker, tone }: { readonly marker: GeometryMarker; readonly tone: string }): React.JSX.Element {
  const { x, y, marker: kind } = marker;
  const shared = {
    'data-graph': 'marker',
    'data-kind': kind,
    'data-lane': marker.lane,
    'data-row': marker.row,
  };
  switch (kind) {
    case 'entry': {
      return <circle {...shared} cx={x} cy={y} r='4' className={cn('fill-current', tone)} />;
    }
    case 'version': {
      // A 12 px dot with a 2 px halo of the pane's background, so a rail never touches it.
      return (
        <circle {...shared} cx={x} cy={y} r='7' strokeWidth='2' className={cn('fill-current stroke-sidebar', tone)} />
      );
    }
    case 'current': {
      return (
        <circle {...shared} cx={x} cy={y} r='6' strokeWidth='2' className={cn('fill-sidebar stroke-current', tone)} />
      );
    }
    case 'fold': {
      return (
        <circle
          {...shared}
          cx={x}
          cy={y}
          r='5.5'
          strokeWidth='1'
          strokeDasharray='2 2'
          className='fill-sidebar stroke-current text-muted-foreground'
        />
      );
    }
    case 'setup': {
      return (
        <circle
          {...shared}
          cx={x}
          cy={y}
          r='2.5'
          strokeWidth='1'
          className='fill-sidebar stroke-current text-muted-foreground'
        />
      );
    }
    case 'conflict': {
      return (
        <path {...shared} d={`M${String(x)} ${String(y - 7)}l7 7-7 7-7-7Z`} className='fill-current text-warning' />
      );
    }
    case 'open': {
      // Six even dashes on a 10 px circle: the circumference is 26.7, so 2.2 on and 2.25 off.
      return (
        <circle
          {...shared}
          cx={x}
          cy={y}
          r='4.25'
          strokeWidth='1.5'
          strokeDasharray='2.2 2.25'
          className={cn('fill-sidebar stroke-current', tone)}
        />
      );
    }
  }
}

/**
 * The graph, laid over the list it describes.
 *
 * @param props - The geometry, each line's slot, and the list's height.
 * @returns A decorative SVG; every fact it shows is also in the rows' text.
 */
export function HistoryGraph({
  geometry,
  slots,
  height,
}: {
  readonly geometry: GraphGeometry;
  readonly slots: ReadonlyMap<string, BranchSlot>;
  readonly height: number;
}): React.JSX.Element {
  const toneOf = (branch: string): string => branchTone(slots.get(branch));
  return (
    <svg
      aria-hidden
      data-slot='history-graph'
      width={geometry.width + 16}
      height={height}
      className='pointer-events-none absolute top-0 left-0 overflow-visible'
    >
      {geometry.paths.map((path, index) => (
        <path
          // oxlint-disable-next-line react/no-array-index-key -- a bend is its index in the layout.
          key={index}
          data-graph='bend'
          data-kind={path.kind}
          data-style={path.style}
          data-x0={path.x0}
          data-y0={path.y0}
          data-x1={path.x1}
          data-y1={path.y1}
          d={path.d}
          fill='none'
          strokeWidth='2'
          strokeDasharray={dashes[path.style]}
          className={cn('stroke-current', toneOf(path.branch))}
        />
      ))}
      {geometry.lines.map((line, index) => (
        <line
          // oxlint-disable-next-line react/no-array-index-key -- a rail segment is its index in the geometry.
          key={index}
          data-graph='rail'
          data-style={line.style}
          data-lane={line.lane}
          data-branch={line.branch}
          x1={line.x}
          x2={line.x}
          y1={line.y1}
          y2={line.y2}
          strokeWidth='2'
          strokeDasharray={dashes[line.style]}
          className={cn('stroke-current', toneOf(line.branch))}
        />
      ))}
      {geometry.markers.map((marker) => (
        <Marker key={`${String(marker.row)}:${String(marker.lane)}`} marker={marker} tone={toneOf(marker.branch)} />
      ))}
    </svg>
  );
}
