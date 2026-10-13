import { describe, expect, it, vi } from 'vitest';
import { render as renderBare, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createActor } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import type { GeometryComponentManifest } from '@taucad/types';
import { modelInteractionMachine } from '@taucad/viewer/machines/model-interaction.machine';
import { CadReferenceChip } from '#components/chat/cad-reference-chip.js';

const project = vi.hoisted((): { modelInteractionRef?: ActorRefFrom<typeof modelInteractionMachine> } => ({}));

vi.mock('#hooks/use-project.js', () => ({
  useProject: () => project,
}));

const modelInteraction = createActor(modelInteractionMachine, { input: {} }).start();
project.modelInteractionRef = modelInteraction;

/** The app mounts one TooltipProvider at its root; the chip carries a tooltip. */
const render = (ui: React.ReactElement) => renderBare(ui, { wrapper: TooltipProvider });

const capabilities = {
  canHide: true,
  canIsolate: true,
  canFocus: true,
  canAdjustOpacity: true,
  hasDrawings: false,
  hasPreciseTopology: false,
  exports: [],
};
const node = ({ id, name, kind, index }: { id: string; name: string; kind: 'model' | 'part'; index: number }) => ({
  id,
  name,
  kind,
  selector: `node/${index}`,
  childIds: [],
  depth: index,
  path: [id],
  meshNodeIndices: [],
  primitiveIndices: [],
  materialIndices: [],
  capabilities,
});
const manifest: GeometryComponentManifest = {
  schemaVersion: 1,
  sourceFile: 'gears/main.ts',
  geometryHash: 'hash-1',
  rootId: 'root',
  nodeOrder: ['root', 'component:sun_gear'],
  nodesById: {
    root: node({ id: 'root', name: 'Model', kind: 'model', index: 0 }),
    'component:sun_gear': node({ id: 'component:sun_gear', name: 'Sun gear', kind: 'part', index: 1 }),
  },
  capabilities,
};

const selectedIn = (unitId: string): readonly string[] =>
  modelInteraction.getSnapshot().context.unitsById[unitId]?.selectedComponentIds ?? [];

describe('CadReferenceChip', () => {
  it('should stay a plain chip while the viewer does not show the component', () => {
    render(<CadReferenceChip target={{ path: 'other.ts', componentId: 'component:sun_gear' }} />);

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('sun_gear')).toBeDefined();
  });

  it('should select the component in the viewer when clicked', async () => {
    modelInteraction.send({ type: 'loadManifest', unitId: 'file:gears/main.ts', manifest });
    render(<CadReferenceChip target={{ path: 'gears/main.ts', componentId: 'component:sun_gear' }} />);

    await userEvent.click(screen.getByRole('button', { name: 'Select sun_gear in the viewer' }));

    expect(selectedIn('file:gears/main.ts')).toEqual(['component:sun_gear']);
  });
});
