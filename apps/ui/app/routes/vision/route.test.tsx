// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import VisionPage from '#routes/vision/route.js';
import { clampVisionTime, visionFrame } from '#routes/vision/vision-story.js';

const sceneState = vi.hoisted(() => ({ hasError: false }));
vi.mock('#routes/vision/vision-scene.js', () => ({
  VisionScene: () => {
    if (sceneState.hasError) {
      throw new Error('Graphics unavailable in this check.');
    }
    return null;
  },
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  sceneState.hasError = false;
});

describe('Vision presentation', () => {
  it('should seek both ways, pause offscreen, resume without a time jump, and finish without looping', async () => {
    vi.useFakeTimers();
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    let intersectionCallback: IntersectionObserverCallback | undefined;
    const observer = mock<IntersectionObserver>();
    const setVisible = (visible: boolean) => {
      intersectionCallback?.([mock<IntersectionObserverEntry>({ isIntersecting: visible })], observer);
    };
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        public disconnect = observer.disconnect;
        public constructor(callback: IntersectionObserverCallback) {
          intersectionCallback = callback;
        }
        public observe = () => {
          setVisible(true);
        };
      },
    );
    await act(async () => {
      render(
        <MemoryRouter>
          <VisionPage />
        </MemoryRouter>,
      );
    });
    fireEvent.click(screen.getByRole('button', { name: '04 Move' }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Design what happens next');
    expect(screen.getByRole('slider', { name: 'Story position' })).toHaveValue('36');
    fireEvent.click(screen.getByRole('button', { name: 'Previous chapter' }));
    expect(screen.getByRole('slider', { name: 'Story position' })).toHaveValue('24');
    fireEvent.click(screen.getByRole('button', { name: 'Play the story' }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    const beforeHidden = Number(screen.getByRole('slider').getAttribute('value'));
    expect(beforeHidden).toBeGreaterThan(24);
    act(() => {
      setVisible(false);
    });
    const paused = Number(screen.getByRole('slider').getAttribute('value'));
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(Number(screen.getByRole('slider').getAttribute('value'))).toBe(paused);
    act(() => {
      setVisible(true);
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(Number(screen.getByRole('slider').getAttribute('value')) - paused).toBeLessThanOrEqual(1.01);
    fireEvent.change(screen.getByRole('slider'), { target: { value: '119' } });
    expect(screen.getByRole('button', { name: 'Play the story' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Play the story' }));
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByRole('button', { name: 'Replay the story' })).toBeInTheDocument();
    expect(screen.getByRole('slider')).toHaveValue('120');
    fireEvent.click(screen.getByRole('button', { name: 'Replay the story' }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Give ideas physical form');
  });

  it('should retain every chapter and its future-workflow disclosure with reduced motion', () => {
    vi.spyOn(globalThis, 'matchMedia').mockReturnValue(mock<MediaQueryList>({ matches: true }));
    render(
      <MemoryRouter>
        <VisionPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: 'Play the story' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '06 Make' }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('The next step is physical');
    expect(
      screen.getByText('Ring gear on a 256 mm build plate · Illustration, no print job is sent'),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Take a closer look' })).toBeInTheDocument();
    expect(screen.getAllByRole('main')).toHaveLength(1);
  });

  it('should bound invalid seeks and keep the final chapter at the end', () => {
    expect(clampVisionTime(Number.NaN)).toBe(0);
    expect(clampVisionTime(-1)).toBe(0);
    expect(visionFrame(36).chapter.id).toBe('time');
    expect(visionFrame(24).chapter.id).toBe('evaluate');
    expect(visionFrame(999).chapter.id).toBe('begin');
    expect(visionFrame(999).elapsed).toBe(120);
  });

  it('should preserve the poster, chapter controls and reading path when graphics fail', async () => {
    sceneState.hasError = true;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await act(async () => {
      render(
        <MemoryRouter>
          <VisionPage />
        </MemoryRouter>,
      );
    });
    expect(screen.getByRole('status')).toHaveTextContent('3D is unavailable');
    expect(screen.getByAltText(/The assembled planetary gearbox/)).toBeInTheDocument();
    expect(screen.queryByText(/Preparing 3D/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '10 Begin' }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('What will you make real?');
    expect(screen.getByRole('link', { name: 'Read the story' })).toHaveAttribute('href', '#full-story');
  });
});
