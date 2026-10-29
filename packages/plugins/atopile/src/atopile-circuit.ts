/**
 * Translate atopile's board IR into tscircuit elements and settle them to circuit JSON.
 *
 * atopile emits no schematic and renders 3D through `kicad-cli`; Tau instead hands the parts,
 * pads and nets atopile compiled to `@tscircuit/core`, which lays out a schematic, keeps the
 * KiCad placement on the PCB and attaches each footprint's STEP model, so the circuit-JSON
 * converters Tau already ships render every view.
 */

import { RootCircuit } from '@tscircuit/core';
import { createElement } from 'react';
import type { ReactElement } from 'react';

import type { AtopileBoard, AtopileComponent, AtopilePad } from '#atopile.schemas.js';

/** Circuit JSON element as the handle stores it. */
export type CircuitElement = { type: string };

/** How a board was placed: atopile's KiCad layout, or packed by tscircuit because the layout is unplaced. */
export type AtopilePlacement = 'layout' | 'packed';

const boardMargin = 2;

// Port selectors and net names in tscircuit are identifiers.
const identifier = (value: string): string => {
  const safe = value.replaceAll(/[^A-Za-z0-9_]/gu, '_');
  return /^[A-Za-z_]/u.test(safe) ? safe : `N_${safe}`;
};

// KiCad pad names are numbers for most parts but may be `A1`, `EP` or empty. Numeric names keep
// their number as the pin; the rest take the next free numbers in first-seen order.
const pinNumbersOf = (pads: readonly AtopilePad[]): ReadonlyMap<string, number> => {
  const numbers = new Map<string, number>();
  const named = [...new Set(pads.map((pad) => pad.name).filter((name) => name !== ''))];
  for (const name of named) {
    if (/^[1-9]\d*$/u.test(name)) {
      numbers.set(name, Number(name));
    }
  }
  let next = Math.max(0, ...numbers.values()) + 1;
  for (const name of named) {
    if (!numbers.has(name)) {
      numbers.set(name, next);
      next += 1;
    }
  }
  return numbers;
};

// KiCad's Y axis points down; tscircuit's points up.
const flipY = (y: number): number => (y === 0 ? 0 : -y);

type PadInput = {
  pad: AtopilePad;
  rotation: number;
  pin: number | undefined;
  key: string;
};

const padElement = ({ pad, rotation, pin, key }: PadInput): ReactElement => {
  const portHints = pin === undefined ? [] : [`pin${pin}`];
  const quarterTurned = Math.abs(((pad.rotation - rotation) % 180) + 180) % 180 === 90;
  const width = quarterTurned ? pad.height : pad.width;
  const height = quarterTurned ? pad.width : pad.height;
  const position = { pcbX: pad.localX, pcbY: flipY(pad.localY) };
  if (pad.type === 'thru_hole' && pad.drill !== null) {
    return createElement('platedhole', {
      key,
      shape: 'circle',
      holeDiameter: pad.drill,
      outerDiameter: Math.max(width, height),
      portHints,
      ...position,
    });
  }
  const shape = pad.shape === 'circle' ? 'circle' : pad.shape === 'oval' ? 'pill' : 'rect';
  return shape === 'circle'
    ? createElement('smtpad', {
        key,
        shape,
        radius: width / 2,
        portHints,
        ...position,
      })
    : createElement('smtpad', {
        key,
        shape,
        width,
        height,
        ...(shape === 'pill' ? { radius: Math.min(width, height) / 2 } : {}),
        portHints,
        ...position,
      });
};

const cadModelOf = (component: AtopileComponent): Record<string, unknown> | undefined => {
  const model = component.models.find((entry) => entry.base64 !== undefined && entry.format?.startsWith('st'));
  if (model?.base64 === undefined) {
    return undefined;
  }
  const [x, y, z] = model.offset;
  const [rx, ry, rz] = model.rotate;
  return {
    stepUrl: `data:model/step;base64,${model.base64}`,
    positionOffset: { x, y, z },
    rotationOffset: { x: -rx, y: -ry, z: -rz },
  };
};

const componentElement = (component: AtopileComponent, placement: AtopilePlacement): ReactElement => {
  const pinNumbers = pinNumbersOf(component.pads);
  // Numbered pads keep tscircuit's default `pinN` label; named pads (`A1`, `EP`) carry their name.
  const pinLabels = Object.fromEntries(
    [...pinNumbers].filter(([name]) => !/^\d+$/u.test(name)).map(([name, pin]) => [`pin${pin}`, identifier(name)]),
  );
  const footprint = createElement(
    'footprint',
    {},
    ...component.pads.map((pad, index) =>
      padElement({
        pad,
        rotation: component.rotation,
        pin: pinNumbers.get(pad.name),
        key: `${pad.name}-${String(index)}`,
      }),
    ),
  );
  const cadModel = cadModelOf(component);
  return createElement('chip', {
    key: component.designator,
    name: component.designator,
    footprint,
    pinLabels,
    ...(component.mpn ? { manufacturerPartNumber: component.mpn } : {}),
    ...(component.lcsc ? { supplierPartNumbers: { jlcpcb: [component.lcsc] } } : {}),
    ...(cadModel ? { cadModel } : {}),
    ...(placement === 'layout'
      ? {
          pcbX: component.x,
          pcbY: flipY(component.y),
          pcbRotation: component.rotation,
          ...(component.layer.startsWith('B.') ? { layer: 'bottom' } : {}),
        }
      : {}),
  });
};

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

const boundsOf = (points: ReadonlyArray<readonly [number, number]>): Bounds | undefined =>
  points.length === 0
    ? undefined
    : {
        minX: Math.min(...points.map(([x]) => x)),
        minY: Math.min(...points.map(([, y]) => y)),
        maxX: Math.max(...points.map(([x]) => x)),
        maxY: Math.max(...points.map(([, y]) => y)),
      };

/**
 * Decide whether the KiCad layout is placed. A fresh atopile build leaves new footprints on a grid
 * that ignores the board outline; only a layout whose pads all sit inside the outline is placed.
 *
 * @param board - The worker's board IR.
 * @returns `layout` when the KiCad positions are kept, `packed` when tscircuit packs the parts.
 */
export const placementOf = (board: AtopileBoard): AtopilePlacement => {
  const outline = boundsOf(board.outline);
  if (!outline) {
    return 'packed';
  }
  const inside = board.components.every((component) =>
    component.pads.every(
      (pad) => pad.x >= outline.minX && pad.x <= outline.maxX && pad.y >= outline.minY && pad.y <= outline.maxY,
    ),
  );
  return inside ? 'layout' : 'packed';
};

const boardProps = (board: AtopileBoard, placement: AtopilePlacement): Record<string, unknown> => {
  const outline = boundsOf(board.outline);
  // Copper is the designer's work in KiCad; Tau shows ratsnest connections instead of inventing routes.
  const common = { routingDisabled: true };
  if (outline && placement === 'layout') {
    return {
      ...common,
      width: outline.maxX - outline.minX,
      height: outline.maxY - outline.minY,
      pcbX: (outline.minX + outline.maxX) / 2,
      pcbY: flipY((outline.minY + outline.maxY) / 2),
    };
  }
  if (outline) {
    return {
      ...common,
      width: outline.maxX - outline.minX,
      height: outline.maxY - outline.minY,
      pcbPack: true,
    };
  }
  const pads = boundsOf(board.components.flatMap((component) => component.pads.map((pad) => [pad.x, pad.y] as const)));
  const size = pads
    ? {
        width: pads.maxX - pads.minX + 2 * boardMargin,
        height: pads.maxY - pads.minY + 2 * boardMargin,
      }
    : { width: 10, height: 10 };
  return { ...common, ...size, pcbPack: true };
};

/**
 * Settle the IR through `@tscircuit/core` to circuit JSON.
 *
 * @param board - The worker's board IR.
 * @returns Circuit JSON and the placement the PCB used.
 */
export const atopileBoardToCircuitJson = async (
  board: AtopileBoard,
): Promise<{ circuitJson: CircuitElement[]; placement: AtopilePlacement }> => {
  const placement = placementOf(board);
  const pinNumbers = new Map(board.components.map((component) => [component.designator, pinNumbersOf(component.pads)]));
  const traces = board.nets.flatMap((net) =>
    net.pads.flatMap(([designator, padName]) => {
      const pin = pinNumbers.get(designator)?.get(padName);
      return pin === undefined
        ? []
        : [
            createElement('trace', {
              key: `${net.name}:${designator}:${padName}`,
              from: `.${designator} > .pin${pin}`,
              to: `net.${identifier(net.name)}`,
            }),
          ];
    }),
  );
  const circuit = new RootCircuit({ platform: { autorouter: 'auto' } });
  circuit.add(
    createElement(
      'board',
      boardProps(board, placement),
      ...board.components.map((component) => componentElement(component, placement)),
      ...traces,
    ),
  );
  await circuit.renderUntilSettled();
  return {
    circuitJson: circuit.getCircuitJson() as CircuitElement[],
    placement,
  };
};
