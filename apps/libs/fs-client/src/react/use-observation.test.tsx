// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it } from 'vitest';
import { guardActors } from '@taucad/xstate-testing/inspect';
import { StepClock } from '@taucad/xstate-testing/clock';
import { observationIgnoredEvents } from '#machines/observation.machine.js';
import { ObservationService } from '#observation-service.js';
import { useObservation, useObservationValue } from '#react/use-observation.js';

it('keeps value consumers stable while status consumers see equal-value refresh', async () => {
  const guard = guardActors({ ignore: { observation: observationIgnoredEvents } });
  const value = { text: 'same' };
  let next = Promise.resolve(value);
  const closed = Promise.withResolvers<void>();
  const service = new ObservationService({
    resource: 'render-count',
    actorOptions: { clock: new StepClock(), inspect: guard.inspect },
    watch: () => ({ ready: Promise.resolve(), closed: closed.promise, dispose: () => undefined }),
    read: async () => next,
    equal: (left, right) => left.text === right.text,
  });
  let valueRenders = 0;
  let statusRenders = 0;
  const selected = renderHook(() => {
    valueRenders++;
    return useObservationValue(service);
  });
  const status = renderHook(() => {
    statusRenders++;
    return useObservation(service);
  });
  await waitFor(() => {
    expect(status.result.current.status).toBe('ready');
  });
  expect(selected.result.current).toBe(value);
  const beforeValue = valueRenders;
  const beforeStatus = statusRenders;
  const refresh = Promise.withResolvers<typeof value>();
  next = refresh.promise;
  act(() => {
    service.invalidate();
  });
  await waitFor(() => {
    expect(status.result.current.status).toBe('pending');
  });
  expect(valueRenders).toBe(beforeValue);
  await act(async () => {
    refresh.resolve({ text: 'same' });
  });
  await waitFor(() => {
    expect(status.result.current.status).toBe('ready');
  });
  expect(valueRenders).toBe(beforeValue);
  expect(statusRenders).toBeGreaterThan(beforeStatus);
  await act(async () => {
    closed.resolve();
  });
  await waitFor(() => {
    expect(status.result.current.status).toBe('closed');
  });
  expect(selected.result.current).toBe(value);
  expect(valueRenders).toBe(beforeValue);
  selected.unmount();
  status.unmount();
  expect(service.diagnostics.leases).toBe(0);
  expect(guard.take()).toEqual([]);
});
