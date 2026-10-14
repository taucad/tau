import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Toaster, toast } from '@taucad/ui/components/sonner';

describe('Toaster reading time and dismissal', () => {
  it.each([
    {
      id: 'default',
      expectedDuration: 7000,
      duration: undefined,
      toastDuration: undefined,
    },
    {
      id: 'provider-override',
      expectedDuration: 2000,
      duration: 2000,
      toastDuration: undefined,
    },
    {
      id: 'message-override',
      expectedDuration: 1000,
      duration: 2000,
      toastDuration: 1000,
    },
  ])(
    'honors the $id reading window without taking focus',
    async ({ id, expectedDuration, duration, toastDuration }) => {
      vi.useFakeTimers();
      try {
        const onAutoClose = vi.fn();
        render(
          <>
            <button type='button'>Continue editing</button>
            <Toaster id={id} theme='light' {...(duration === undefined ? {} : { duration })} />
          </>,
        );
        screen.getByRole('button', { name: 'Continue editing' }).focus();
        toast('Exported STEP', {
          id,
          toasterId: id,
          duration: toastDuration,
          onAutoClose,
        });
        await act(async () => vi.advanceTimersByTimeAsync(0));
        expect(screen.getByText('Exported STEP')).toBeVisible();
        expect(screen.getByRole('button', { name: 'Close toast' })).toBeVisible();
        expect(screen.getByRole('button', { name: 'Continue editing' })).toHaveFocus();
        await act(async () => vi.advanceTimersByTimeAsync(expectedDuration - 1));
        expect(onAutoClose).not.toHaveBeenCalled();
        await act(async () => vi.advanceTimersByTimeAsync(1));
        expect(onAutoClose).toHaveBeenCalledOnce();
      } finally {
        cleanup();
        toast.dismiss();
        vi.useRealTimers();
      }
    },
  );

  it('keeps loading and explicitly persistent feedback until resolved or dismissed', async () => {
    vi.useFakeTimers();
    try {
      const onAutoClose = vi.fn();
      render(<Toaster id='persistent' theme='light' />);
      toast.loading('Preparing export', {
        id: 'loading',
        toasterId: 'persistent',
        onAutoClose,
      });
      toast('Choose a destination', {
        id: 'infinite',
        toasterId: 'persistent',
        duration: Infinity,
        onAutoClose,
      });
      await act(async () => vi.advanceTimersByTimeAsync(60_000));
      expect(onAutoClose).not.toHaveBeenCalled();
      expect(screen.getByText('Preparing export')).toBeVisible();
      expect(screen.getByText('Choose a destination')).toBeVisible();
      fireEvent.click(screen.getByRole('button', { name: 'Close toast' }));
      await act(async () => vi.advanceTimersByTimeAsync(500));
      expect(screen.queryByText('Choose a destination')).not.toBeInTheDocument();
      expect(screen.getByText('Preparing export')).toBeVisible();
    } finally {
      cleanup();
      toast.dismiss();
      vi.useRealTimers();
    }
  });

  it('retains explicit dismissal overrides and the action callback', async () => {
    vi.useFakeTimers();
    try {
      const onClick = vi.fn();
      render(<Toaster id='action' theme='light' closeButton={false} />);
      toast('Restored revision', {
        id: 'action',
        toasterId: 'action',
        action: { label: 'Undo restore', onClick },
      });
      await act(async () => vi.advanceTimersByTimeAsync(0));
      expect(screen.queryByRole('button', { name: 'Close toast' })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Undo restore' }));
      expect(onClick).toHaveBeenCalledOnce();
      await act(async () => vi.advanceTimersByTimeAsync(500));
      expect(screen.queryByText('Restored revision')).not.toBeInTheDocument();
    } finally {
      cleanup();
      toast.dismiss();
      vi.useRealTimers();
    }
  });
});
