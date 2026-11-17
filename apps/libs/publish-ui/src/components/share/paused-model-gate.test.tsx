import { fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { PausedModelGate } from '#components/share/paused-model-gate.js';

const show = (element: React.JSX.Element): void => {
  const router = createMemoryRouter([{ path: '/', element }]);
  render(<RouterProvider router={router} />);
};

describe('PausedModelGate (crash capture blueprint)', () => {
  it('shows "We paused this model" with Try again first, and the thumbnail without the facts line', () => {
    const onRun = vi.fn();
    show(
      <PausedModelGate
        state='paused'
        name='Worm Gear System'
        thumbnailUrl='blob:thumbnail'
        facts='main.ts · Replicad'
        onRun={onRun}
      />,
    );

    expect(screen.getByRole('heading', { name: 'We paused this model' })).toBeInTheDocument();
    expect(screen.getByText('Worm Gear System')).toBeInTheDocument();
    expect(screen.queryByText('main.ts · Replicad')).not.toBeInTheDocument();
    const buttons = [...screen.getAllByRole('button'), ...screen.getAllByRole('link')];
    expect(buttons.map((button) => button.textContent)).toEqual(['Try again', 'Go home']);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRun).toHaveBeenCalledTimes(1);
  });

  it('shows the repeat state with Go home first and Try anyway second', () => {
    show(<PausedModelGate state='repeat' name='Worm Gear System' onRun={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'This model can’t run on this device yet' })).toBeInTheDocument();
    const actions = screen.getByRole('link', { name: 'Go home' }).parentElement;
    expect([...(actions?.children ?? [])].map((child) => child.textContent)).toEqual(['Go home', 'Try anyway']);
  });

  it('shows the icon and the facts line when there is no stored thumbnail', () => {
    show(<PausedModelGate state='paused' name='Motor mount' facts='main.ts · Replicad' onRun={vi.fn()} />);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('main.ts · Replicad')).toBeInTheDocument();
  });

  it('says nothing about reporting', () => {
    show(<PausedModelGate state='repeat' name='Motor mount' onRun={vi.fn()} />);

    expect(document.body.textContent).not.toMatch(/report|telemetry|diagnostic/iu);
  });
});
