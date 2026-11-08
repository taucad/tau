// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
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

it('reports an absent service as not started on the server and the client', () => {
  function Status(): string {
    return useObservation<string>(undefined).status;
  }
  expect(renderToString(createElement(Status))).toBe('registering');
  const absent = renderHook(() => useObservation<string>(undefined));
  expect(absent.result.current).toEqual({ status: 'registering' });
  absent.unmount();
});

it('reports a released service as not started until this consumer acquires it, never closed', async () => {
  const guard = guardActors({ ignore: { observation: observationIgnoredEvents } });
  const service = new ObservationService({
    resource: 'idle-remount',
    actorOptions: { clock: new StepClock(), inspect: guard.inspect },
    watch: () => ({
      ready: Promise.resolve(),
      closed: Promise.withResolvers<void>().promise,
      dispose: () => undefined,
    }),
    read: async () => 'value',
  });
  service.acquire().release();
  expect(service.getSnapshot().status).toBe('closed');
  const statuses: string[] = [];
  const consumer = renderHook(() => {
    const snapshot = useObservation(service);
    statuses.push(snapshot.status);
    return snapshot;
  });
  await waitFor(() => {
    expect(consumer.result.current).toEqual({ status: 'ready', value: 'value' });
  });
  expect(statuses[0]).toBe('registering');
  expect(statuses).not.toContain('closed');
  consumer.unmount();
  expect(guard.take()).toEqual([]);
});

it('keeps a disposed service closed', () => {
  const service = new ObservationService<string>({ resource: 'disposed', read: async () => 'value' });
  service.dispose();
  const consumer = renderHook(() => useObservation(service));
  expect(consumer.result.current.status).toBe('closed');
  consumer.unmount();
});
