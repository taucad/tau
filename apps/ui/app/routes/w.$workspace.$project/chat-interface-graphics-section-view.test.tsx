import { Profiler } from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createActor, createAsyncLogic } from 'xstate';
import type { Actor } from 'xstate';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { GraphicsProvider } from '#hooks/use-graphics.js';
import { graphicsMachine } from '#machines/graphics.machine.js';
import { ChatInterfaceGraphicsSectionView } from '#routes/w.$workspace.$project/chat-interface-graphics-section-view.js';

type FieldRender = Readonly<{ unit: string | undefined; onValueChange: (value: number) => void }>;

/* The real `ParametersNumber` draws each row through this field, so a render recorded here is a row that
 * re-rendered: translation rows carry the length unit, rotation rows carry degrees. */
const { fieldRenders } = vi.hoisted(() => ({ fieldRenders: [] as FieldRender[] }));

vi.mock('#components/geometry/parameters/parameters-number-field.js', () => ({
  ParametersNumberField(properties: FieldRender): React.JSX.Element {
    fieldRenders.push({ unit: properties.unit, onValueChange: properties.onValueChange });
    return <div data-testid='section-field' />;
  },
}));

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

let activeActor: Actor<typeof graphicsMachine> | undefined;

afterEach(() => {
  activeActor?.stop();
  activeActor = undefined;
  fieldRenders.length = 0;
});

/** The panel over an active cut on the XY plane, with the mount and its settling already counted out. */
const renderPanel = async (): Promise<{ actor: Actor<typeof graphicsMachine>; commits: () => number }> => {
  const actor = createActor(
    graphicsMachine.provide({ actors: { probeWebGpu: createAsyncLogic({ run: async () => false }) } }),
    { input: {} },
  ).start();
  activeActor = actor;
  actor.send({ type: 'sceneRadiusUpdated', radius: 0.1, centerMeters: [0, 0, 0] });
  actor.send({ type: 'setSectionViewActive', payload: true });
  actor.send({ type: 'selectSectionView', payload: 'xy' });

  let commitCount = 0;
  render(
    <TooltipProvider>
      <GraphicsProvider graphicsRef={actor}>
        <Profiler
          id='section-panel'
          onRender={() => {
            commitCount += 1;
          }}
        >
          <ChatInterfaceGraphicsSectionView />
        </Profiler>
      </GraphicsProvider>
    </TooltipProvider>,
  );
  await act(async () => undefined);
  const settledCommits = commitCount;
  return { actor, commits: () => commitCount - settledCommits };
};

describe('ChatInterfaceGraphicsSectionView', () => {
  it('should draw the translation row and the three rotation rows', async () => {
    await renderPanel();

    expect(fieldRenders.slice(0, 4).map(({ unit }) => unit)).toEqual(['mm', '°', '°', '°']);
  });

  it('should not re-render for a graphics change it does not show, or a step that changes nothing', async () => {
    const { actor, commits } = await renderPanel();
    fieldRenders.length = 0;

    act(() => {
      actor.send({ type: 'setGridVisibility', payload: false });
      actor.send({ type: 'cameraViewChanged', verticalSpan: 0.5 });
      actor.send({ type: 'setHoveredMeasurement', payload: 'measurement:1' });
      actor.send({ type: 'markModelPointerGestureMoved' });
      actor.send({ type: 'setSectionViewPivot', payload: [0, 0, 0] });
    });

    expect(commits()).toBe(0);
    expect(fieldRenders).toEqual([]);
  });

  it('should re-render only the translation row while the translation changes', async () => {
    const { actor, commits } = await renderPanel();
    fieldRenders.length = 0;

    act(() => {
      actor.send({ type: 'setSectionViewTranslation', payload: 0.005 });
    });

    expect(commits()).toBe(1);
    expect(fieldRenders.map(({ unit }) => unit)).toEqual(['mm']);
  });

  it('should re-render only the rotation row whose angle changed', async () => {
    const { actor, commits } = await renderPanel();
    fieldRenders.length = 0;

    act(() => {
      actor.send({ type: 'setSectionViewRotation', payload: [toRadians(10), 0, 0] });
    });

    expect(commits()).toBe(1);
    expect(fieldRenders.map(({ unit }) => unit)).toEqual(['°']);
  });

  it('should send a rotation row with the angles the other rows hold now, not at its last render', async () => {
    const { actor } = await renderPanel();
    const yRow = fieldRenders[2]!;

    // The X angle changes without re-rendering the Y row.
    act(() => {
      actor.send({ type: 'setSectionViewRotation', payload: [toRadians(10), 0, 0] });
    });
    act(() => {
      yRow.onValueChange(30);
    });

    expect(actor.getSnapshot().context.sectionViewRotation).toEqual([toRadians(10), toRadians(30), 0]);
  });
});
