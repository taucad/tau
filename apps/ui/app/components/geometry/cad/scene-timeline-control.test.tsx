import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { SceneTimelineEntry, SceneTimelineStreamState } from '#machines/scene-timeline.js';
import { SceneTimelineControl } from '#components/geometry/cad/scene-timeline-control.js';

const entry = (sequence: number, label?: string, availability: SceneTimelineEntry['availability'] = 'memory') =>
  ({
    renderId: 'render-a',
    sequence,
    revision: sequence,
    sceneDigest: `scene-${sequence}` as SceneTimelineEntry['sceneDigest'],
    label,
    availability,
    byteLength: 0,
  }) satisfies SceneTimelineEntry;

const renderControl = (options?: {
  selectedSequence?: number;
  followLive?: boolean;
  streamState?: SceneTimelineStreamState;
  entries?: readonly SceneTimelineEntry[];
}) => {
  const onSelectSequence = vi.fn();
  const onLive = vi.fn();
  render(
    <SceneTimelineControl
      entries={options?.entries ?? [entry(2, 'Shell'), entry(5, 'Ports'), entry(9, 'Finish')]}
      selectedSequence={options?.selectedSequence ?? 5}
      isFollowingLive={options?.followLive ?? false}
      streamState={options?.streamState ?? 'live'}
      onSelectSequence={onSelectSequence}
      onLive={onLive}
    />,
  );
  return { onSelectSequence, onLive };
};

describe('SceneTimelineControl', () => {
  it('renders only when at least two frames are available', () => {
    const { rerender } = render(
      <SceneTimelineControl
        entries={[entry(0)]}
        selectedSequence={0}
        isFollowingLive
        streamState='live'
        onSelectSequence={vi.fn()}
        onLive={vi.fn()}
      />,
    );
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();

    rerender(
      <SceneTimelineControl
        entries={[entry(0), entry(1)]}
        selectedSequence={1}
        isFollowingLive
        streamState='live'
        onSelectSequence={vi.fn()}
        onLive={vi.fn()}
      />,
    );
    expect(screen.getByRole('slider', { name: 'Scene timeline' })).toBeInTheDocument();
  });

  it('exposes position, stage, paused status, and preview-only meaning', () => {
    renderControl();
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
    expect(screen.getByText('Ports')).toBeInTheDocument();
    expect(screen.getByText('Paused')).toBeInTheDocument();
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', 'Frame 2 of 3: Ports. Paused.');
    expect(screen.getByText(/preview only/i)).toBeInTheDocument();
  });

  it('supports arrow stepping, Home/End, and an explicit Live action', async () => {
    const user = userEvent.setup();
    const { onSelectSequence, onLive } = renderControl();
    const slider = screen.getByRole('slider');
    slider.focus();

    await user.keyboard('{ArrowRight}{Home}{End}');
    expect(onSelectSequence).toHaveBeenNthCalledWith(1, 9);
    expect(onSelectSequence).toHaveBeenNthCalledWith(2, 2);
    expect(onSelectSequence).toHaveBeenNthCalledWith(3, 9);

    await user.click(screen.getByRole('button', { name: 'Return to live scene' }));
    expect(onLive).toHaveBeenCalledOnce();
  });

  it('announces rehydrating and unavailable retained frames', () => {
    const { rerender } = render(
      <SceneTimelineControl
        entries={[entry(0), entry(1, 'Saved stage', 'rehydrating')]}
        selectedSequence={1}
        isFollowingLive={false}
        streamState='live'
        onSelectSequence={vi.fn()}
        onLive={vi.fn()}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Restoring Saved stage');

    rerender(
      <SceneTimelineControl
        entries={[entry(0), entry(1, 'Saved stage', 'unavailable')]}
        selectedSequence={1}
        isFollowingLive={false}
        streamState='live'
        onSelectSequence={vi.fn()}
        onLive={vi.fn()}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Saved stage is unavailable');
  });

  it('offers an accessible explicit action to save the selected preview stage', async () => {
    const user = userEvent.setup();
    const onSaveSelectedStage = vi.fn();
    render(
      <SceneTimelineControl
        entries={[entry(0), entry(1, 'Ports')]}
        selectedSequence={1}
        isFollowingLive={false}
        streamState='live'
        isSaveSelectedStageEnabled
        artifactSave={{ status: 'idle' }}
        onSelectSequence={vi.fn()}
        onLive={vi.fn()}
        onSaveSelectedStage={onSaveSelectedStage}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Save selected preview stage to project' }));
    expect(onSaveSelectedStage).toHaveBeenCalledOnce();
    expect(screen.getByText(/preview stage.*export still uses the final model/i)).toBeVisible();
  });

  it('surfaces save success and failure without presenting the preview as export truth', () => {
    const props = {
      entries: [entry(0), entry(1, 'Ports')],
      selectedSequence: 1,
      isFollowingLive: false,
      streamState: 'live',
      isSaveSelectedStageEnabled: true,
      onSelectSequence: vi.fn(),
      onLive: vi.fn(),
      onSaveSelectedStage: vi.fn(),
    } satisfies React.ComponentProps<typeof SceneTimelineControl>;
    const { rerender } = render(
      <SceneTimelineControl
        {...props}
        artifactSave={{ status: 'saved', sequence: 1, path: 'stages/main-ports.glb' }}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Saved preview stage as stages/main-ports.glb');

    rerender(
      <SceneTimelineControl
        {...props}
        artifactSave={{ status: 'failed', sequence: 1, message: 'The workspace is read-only' }}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Could not save preview stage: The workspace is read-only');
  });
});
