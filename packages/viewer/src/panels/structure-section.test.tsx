import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createActor } from 'xstate';
import type { GeometryComponentManifest } from '@taucad/types';
import {
  createSourceModelInteractionUnitId,
  getModelInteractionUnitState,
  modelInteractionMachine,
} from '#machines/model-interaction.machine.js';
import { StructureSection } from '#panels/structure-section.jsx';

const capabilities = {
  canHide: true,
  canIsolate: true,
  canFocus: true,
  canAdjustOpacity: true,
  hasDrawings: false,
  hasPreciseTopology: false,
  exports: [],
} satisfies GeometryComponentManifest['capabilities'];
const unitId = createSourceModelInteractionUnitId('main.ts');

const part = (id: string, name: string, index: number): GeometryComponentManifest['nodesById'][string] => ({
  id,
  name,
  kind: 'part',
  selector: `node/${String(index)}`,
  parentId: 'root',
  childIds: [],
  depth: 1,
  path: ['Model', name],
  meshNodeIndices: [index],
  primitiveIndices: [0],
  materialIndices: [index],
  capabilities,
});

const manifest: GeometryComponentManifest = {
  schemaVersion: 1,
  sourceFile: 'main.ts',
  rootId: 'root',
  nodeOrder: ['root', 'housing', 'gear'],
  capabilities,
  nodesById: {
    root: {
      id: 'root',
      name: 'Model',
      kind: 'model',
      selector: 'root',
      childIds: ['housing', 'gear'],
      depth: 0,
      path: ['Model'],
      meshNodeIndices: [],
      primitiveIndices: [],
      materialIndices: [],
      capabilities,
    },
    housing: part('housing', 'Housing', 0),
    gear: part('gear', 'Gear', 1),
  },
};

const loadedActor = () => {
  const actor = createActor(modelInteractionMachine, { input: {} }).start();
  actor.send({ type: 'loadManifest', unitId, manifest, source: 'viewer' });
  return actor;
};

describe('StructureSection', () => {
  it('should show an empty state before the view has a model', () => {
    const actor = createActor(modelInteractionMachine, { input: {} }).start();
    render(<StructureSection modelInteractionRef={actor} unitId={undefined} />);
    expect(screen.getByText('No components')).toBeVisible();
  });

  it("should list the model's components, not its root, and select one on click", async () => {
    const actor = loadedActor();
    render(<StructureSection modelInteractionRef={actor} unitId={unitId} />);
    expect(screen.queryByRole('button', { name: 'Model' })).toBeNull();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Gear' }));

    expect(getModelInteractionUnitState(actor.getSnapshot().context, unitId).selectedComponentIds).toEqual(['gear']);
    expect(screen.getByRole('button', { name: 'Gear' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('should hide a component and show it again', async () => {
    const actor = loadedActor();
    render(<StructureSection modelInteractionRef={actor} unitId={unitId} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Hide Housing' }));
    expect(getModelInteractionUnitState(actor.getSnapshot().context, unitId).hiddenComponentIds).toEqual(['housing']);

    await user.click(screen.getByRole('button', { name: 'Show Housing' }));
    expect(getModelInteractionUnitState(actor.getSnapshot().context, unitId).hiddenComponentIds).toEqual([]);
  });
});
