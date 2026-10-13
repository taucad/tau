import { expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { TurnPlacementChannel } from '@taucad/agent-host/channel-client';
import { createResidentPlacement } from '#workers/agent-host-placement.js';

const input = {
  requestId: 'complete:run:1',
  key: { chatId: 'chat', runId: 'run', turnId: 'turn', attempt: 1 },
  cut: false,
};
const closed = () => Object.assign(new Error('Channel closed'), { code: 'PEER_UNRESPONSIVE' });
const channel = () => {
  let notify: Parameters<TurnPlacementChannel['onClose']>[0] = () => undefined;
  const port = mock<TurnPlacementChannel>();
  port.onClose.mockImplementation((handler) => {
    notify = handler;
    return () => undefined;
  });
  return {
    port,
    fail: () => {
      notify({ origin: 'timeout', code: 'PEER_UNRESPONSIVE', reason: 'liveness-timeout' });
    },
  };
};

it('should bound a replay to one replacement and retain its exact input', async () => {
  const first = channel();
  const second = channel();
  first.port.complete.mockRejectedValue(closed());
  second.port.complete.mockRejectedValue(closed());
  const recover = vi.fn();
  const resident = createResidentPlacement(first.port, recover);
  const answer = resident.port.complete(input);
  const check = expect(answer).rejects.toMatchObject({ code: 'PEER_UNRESPONSIVE' });
  first.fail();
  resident.replace(second.port);
  second.fail();
  await check;
  expect(first.port.complete).toHaveBeenCalledExactlyOnceWith(input);
  expect(second.port.complete).toHaveBeenCalledExactlyOnceWith(input);
  expect(recover).toHaveBeenCalledOnce();
  resident.close();
});

it('should interrupt an unavailable replacement with the original close diagnostics', async () => {
  const first = channel();
  first.port.complete.mockRejectedValue(closed());
  const resident = createResidentPlacement(first.port);
  const answer = resident.port.complete(input);
  const check = expect(answer).rejects.toMatchObject({
    code: 'PEER_UNRESPONSIVE',
    details: { phase: 'placement.reconnect', close: { origin: 'timeout', reason: 'liveness-timeout' } },
  });
  first.fail();
  // Closing the host interrupts the same bounded wait without leaving a pending operation.
  resident.close();
  await check;
  expect(first.port.complete).toHaveBeenCalledOnce();
});

it('should ignore an old generation close and never retry a domain refusal', async () => {
  const first = channel();
  const second = channel();
  const recover = vi.fn();
  const resident = createResidentPlacement(first.port, recover);
  resident.replace(second.port);
  first.fail();
  expect(recover).not.toHaveBeenCalled();
  second.port.complete.mockResolvedValue({
    requestId: input.requestId,
    status: 'refused',
    code: 'SESSION_FENCED',
    message: 'Replaced.',
  });
  await expect(resident.port.complete(input)).resolves.toMatchObject({ status: 'refused', code: 'SESSION_FENCED' });
  expect(second.port.complete).toHaveBeenCalledOnce();
  resident.close();
});

it('should recover a second idle closure when an operation next needs placement', async () => {
  const first = channel();
  const second = channel();
  const third = channel();
  second.port.complete.mockRejectedValue(closed());
  third.port.complete.mockResolvedValue({ requestId: input.requestId, status: 'applied' });
  const recover = vi.fn();
  const resident = createResidentPlacement(first.port, recover);
  first.fail();
  resident.replace(second.port);
  second.fail();
  const answer = resident.port.complete(input);
  expect(recover).toHaveBeenCalledTimes(2);
  resident.replace(third.port);
  await expect(answer).resolves.toMatchObject({ status: 'applied' });
  resident.close();
});

it('should report the first close before recovery and retain the recovered generation', () => {
  const first = channel();
  const second = channel();
  const observations: unknown[] = [];
  const recover = () => {
    observations.push('recovery requested');
  };
  const resident = createResidentPlacement(first.port, recover, (event) => observations.push(event));
  first.fail();
  first.fail();
  resident.replace(second.port);
  first.fail();
  resident.close();
  expect(observations).toEqual([
    {
      event: 'placement.closed',
      generation: 1,
      origin: 'timeout',
      code: 'PEER_UNRESPONSIVE',
      reason: 'liveness-timeout',
    },
    'recovery requested',
    { event: 'placement.replaced', generation: 2, previousGeneration: 1 },
    { event: 'placement.disposed', generation: 2 },
  ]);
});

it('should recover with the identical request even when diagnostics throw', async () => {
  const first = channel();
  const second = channel();
  first.port.complete.mockRejectedValue(closed());
  second.port.complete.mockResolvedValue({ requestId: input.requestId, status: 'applied' });
  const recover = vi.fn();
  const resident = createResidentPlacement(first.port, recover, () => {
    throw new Error('Storage unavailable');
  });
  const answer = resident.port.complete(input);
  first.fail();
  resident.replace(second.port);
  await expect(answer).resolves.toMatchObject({ status: 'applied' });
  expect(second.port.complete).toHaveBeenCalledExactlyOnceWith(input);
  expect(recover).toHaveBeenCalledOnce();
  resident.close();
});
