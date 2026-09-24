import { describe, expect, it } from 'vitest';
import { toJSONSchema } from 'zod';
import { quantityKinds } from '@taucad/runtime/transcoder';
import { imageEdgeSchemas } from '#image-export-options.js';

type JsonNode = Readonly<Record<string, unknown>>;

/** Every schema node reachable under `name`, through unions, arrays and nested objects. */
const nodesNamed = (node: unknown, name: string, found: JsonNode[] = []): JsonNode[] => {
  if (node === null || typeof node !== 'object') {
    return found;
  }
  const record = node as JsonNode;
  const properties = (record['properties'] ?? {}) as Record<string, unknown>;
  if (properties[name] !== undefined) {
    found.push(properties[name] as JsonNode);
  }
  for (const child of [
    ...Object.values(properties),
    record['items'],
    ...((record['anyOf'] ?? []) as unknown[]),
    ...((record['oneOf'] ?? []) as unknown[]),
  ]) {
    nodesNamed(child, name, found);
  }
  return found;
};

const pixels = { 'x-tau-unit': '1', 'x-tau-space': 'linear', 'x-tau-symbol': 'px' };
const ratio = { 'x-tau-unit': '1', 'x-tau-quantity-kind': quantityKinds.dimensionlessRatio, 'x-tau-space': 'linear' };
const degrees = { 'x-tau-unit': 'deg', 'x-tau-quantity-kind': quantityKinds.planeAngle, 'x-tau-space': 'linear' };

describe.each(Object.keys(imageEdgeSchemas) as Array<keyof typeof imageEdgeSchemas>)('%s option units', (format) => {
  const schema = toJSONSchema(imageEdgeSchemas[format], { target: 'draft-7', io: 'input' });

  it.each([
    ['width', pixels],
    ['height', pixels],
    ['lineWidth', pixels],
    ['verticalFieldOfView', degrees],
    ['zoom', ratio],
    ['margin', ratio],
    ['ambient', ratio],
    ['exposure', ratio],
  ] as const)('declares every %s at the source', (name, semantics) => {
    const nodes = nodesNamed(schema, name);

    expect(nodes.length).toBeGreaterThan(0);
    for (const node of nodes) {
      expect(node).toMatchObject(semantics);
    }
  });

  it('declares quality as a ratio wherever the encoder has one', () => {
    for (const node of nodesNamed(schema, 'quality')) {
      expect(node).toMatchObject(ratio);
    }
  });

  it('leaves world-unit distances unannotated because world.unit chooses their unit', () => {
    for (const name of ['verticalSpan', 'near', 'far']) {
      for (const node of nodesNamed(schema, name)) {
        expect(node).not.toHaveProperty('x-tau-unit');
      }
    }
  });
});
