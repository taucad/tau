import { useCallback, useEffect, useRef, useState } from 'react';
import { checkMachineAction } from '@taucad/runtime/machine';
import type {
  MachineActionCheck,
  MachineClient,
  MachineDirectoryEntry,
  MachineJogHoldParameters,
  MachineRequester,
} from '@taucad/runtime/machine';
import { randomUuid } from '@taucad/utils/id';

/** Who the pane acts as: the person at this computer. @public */
export const operator: MachineRequester = { kind: 'user', id: 'operator', label: 'You' };

/** How long "I am at the machine" lasts without a control being used. Milliseconds. @public */
export const presenceLease = 10 * 60_000;

/** The person's statement that they are at the machine. @public */
export type Presence = Readonly<{
  attended: boolean;
  setAttended: (attended: boolean) => void;
  /** A control was used: the statement lasts another {@link presenceLease}. */
  touch: () => void;
}>;

/**
 * Whether the person has said they are at the machine. The statement is forgotten after ten minutes without a
 * control being used, so it never outlives the person walking away.
 *
 * @returns The presence and how to change it.
 * @public
 */
export const usePresence = (): Presence => {
  const [since, setSince] = useState<number>();
  useEffect(() => {
    if (since === undefined) {
      return;
    }
    const forget = globalThis.setTimeout(
      () => {
        setSince(undefined);
      },
      Math.max(0, since + presenceLease - Date.now()),
    );
    return () => {
      globalThis.clearTimeout(forget);
    };
  }, [since]);
  const setAttended = useCallback((attended: boolean) => {
    setSince(attended ? Date.now() : undefined);
  }, []);
  const touch = useCallback(() => {
    setSince((current) => (current === undefined ? undefined : Date.now()));
  }, []);
  return { attended: since !== undefined, setAttended, touch };
};

/** A press-and-hold in force, as the pane shows it. @public */
export type ActiveHold = Readonly<{ parameters: MachineJogHoldParameters }>;

/** The lease behind a press: granted id, renewal timer, and whether the press already ended. */
type HoldLease = { holdId?: string; timer?: ReturnType<typeof setInterval>; released: boolean };

/** Every control the pane offers, sent the one way the contract allows. @public */
export type MachineControl = Readonly<{
  entry: MachineDirectoryEntry;
  attended: boolean;
  /** What the person may do with one control now; the pure check the host repeats. */
  check: (componentId: string, action: string, kind?: 'action' | 'hold') => MachineActionCheck;
  /** Apply one declared action once; resolves true when the machine accepted it. */
  apply: (componentId: string, action: string, parameters: unknown) => Promise<boolean>;
  /** The control being sent now, as `componentId:action`. */
  pending: string | undefined;
  /** The last refusal, in the person's words. */
  error: string | undefined;
  stop: () => Promise<void>;
  isStopping: boolean;
  beginHold: (componentId: string, parameters: MachineJogHoldParameters) => void;
  endHold: () => void;
  hold: ActiveHold | undefined;
}>;

/**
 * Sends the pane's controls for one machine: every action through {@link checkMachineAction} (as a person, attended
 * as the presence says) and then `applyAction` with a fresh operation id, the capability revision and the run the
 * person saw; `stop` as its own operation; and jog holds renewed every half lease until released.
 *
 * @param input - The client, the machine as observed, the presence and what to call when a control is used.
 * @returns The controls.
 * @public
 */
export const useMachineControl = ({
  client,
  entry,
  attended,
  onUsed,
}: {
  readonly client: MachineClient;
  readonly entry: MachineDirectoryEntry;
  readonly attended: boolean;
  readonly onUsed?: () => void;
}): MachineControl => {
  const [pending, setPending] = useState<string>();
  const [error, setError] = useState<string>();
  const [isStopping, setIsStopping] = useState(false);
  const [hold, setHold] = useState<ActiveHold>();
  /** The hold in force: its id once granted, its renewal timer, and whether the press already ended. */
  const holdRef = useRef<HoldLease>(undefined);

  const check = useCallback(
    (componentId: string, action: string, kind: 'action' | 'hold' = 'action'): MachineActionCheck => {
      const result = checkMachineAction({
        entry,
        componentId,
        action,
        kind,
        caller: 'person',
        attended,
        now: Date.now(),
      });
      // The host lost this machine's session: what the pane shows may be old, so nothing is sent until it reports.
      return entry.freshness === 'current' || result.status === 'unavailable'
        ? result
        : {
            status: 'unavailable',
            descriptor: result.descriptor,
            code: 'MACHINE_ACTION_STALE_OBSERVATION',
            message: `No current observation from ${entry.name}. Wait until it reports again.`,
          };
    },
    [attended, entry],
  );

  const apply = async (componentId: string, action: string, parameters: unknown): Promise<boolean> => {
    const result = check(componentId, action);
    if (result.status !== 'available') {
      setError(result.status === 'unavailable' ? result.message : 'This needs approval first.');
      return false;
    }
    const { descriptor } = result;
    onUsed?.();
    setPending(`${componentId}:${action}`);
    setError(undefined);
    try {
      const receipt = await client.applyAction({
        machineId: entry.machineId,
        componentId,
        capabilityRevision: entry.descriptor.capabilities.revision,
        operationId: randomUuid(),
        action,
        version: descriptor.version,
        expectedRunId:
          'scope' in descriptor && descriptor.scope === 'idle' ? null : (entry.snapshot.run?.runId ?? null),
        parameters,
        requestedBy: operator,
        attended,
      });
      if (receipt.status === 'rejected') {
        setError(receipt.message);
      } else if (receipt.status === 'unknown') {
        setError(
          `${entry.name} did not answer, so Tau cannot tell whether it took “${descriptor.label}”. Nothing is resent; History shows it once the machine reports.`,
        );
      }
      return receipt.status === 'accepted';
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      return false;
    } finally {
      setPending(undefined);
    }
  };

  const stop = async (): Promise<void> => {
    setIsStopping(true);
    setError(undefined);
    try {
      const receipt = await client.stop({
        machineId: entry.machineId,
        operationId: randomUuid(),
        requestedBy: operator,
      });
      if (receipt.status === 'rejected') {
        setError(receipt.message);
      } else if (receipt.status === 'unknown') {
        setError(`${entry.name} did not confirm the stop. Use the machine’s own stop if it is still moving.`);
      }
    } catch (failure) {
      setError(
        `${failure instanceof Error ? failure.message : String(failure)} Use the machine’s own stop if it is still moving.`,
      );
    } finally {
      setIsStopping(false);
    }
  };

  const endHold = useCallback((): void => {
    const current = holdRef.current;
    if (current === undefined) {
      return;
    }
    current.released = true;
    holdRef.current = undefined;
    setHold(undefined);
    globalThis.clearInterval(current.timer);
    if (current.holdId !== undefined) {
      // async-iife: release -- the press ended; the machine stops within its bound even if this never arrives.
      void client.endHold({ holdId: current.holdId }).catch(() => undefined);
    }
  }, [client]);

  const beginHold = (componentId: string, parameters: MachineJogHoldParameters): void => {
    const result = check(componentId, 'motion.jog', 'hold');
    if (result.status !== 'available' || holdRef.current !== undefined) {
      if (result.status === 'unavailable') {
        setError(result.message);
      }
      return;
    }
    onUsed?.();
    setError(undefined);
    const current: HoldLease = { released: false };
    holdRef.current = current;
    setHold({ parameters });
    const begin = async (): Promise<void> => {
      try {
        const granted = await client.beginHold({
          machineId: entry.machineId,
          componentId,
          capabilityRevision: entry.descriptor.capabilities.revision,
          operationId: randomUuid(),
          hold: 'motion.jog',
          version: 1,
          parameters,
          requestedBy: operator,
          attended: true,
        });
        if (granted.status === 'rejected') {
          setError(granted.message);
          endHold();
          return;
        }
        current.holdId = granted.holdId;
        if (current.released) {
          await client.endHold({ holdId: granted.holdId });
          return;
        }
        current.timer = globalThis.setInterval(() => {
          const renew = async (): Promise<void> => {
            const renewed = await client.renewHold({ holdId: granted.holdId });
            if (renewed.status === 'ended' && holdRef.current === current) {
              globalThis.clearInterval(current.timer);
              holdRef.current = undefined;
              setHold(undefined);
            }
          };
          // async-iife: lease -- a missed renewal stops the machine within its bound; that is the design.
          void renew().catch(() => undefined);
        }, granted.lease / 2);
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : String(failure));
        if (holdRef.current === current) {
          endHold();
        }
      }
    };
    // async-iife: hold -- the press starts now; renewals follow while it lasts.
    void begin();
  };

  useEffect(() => endHold, [endHold]);

  return { entry, attended, check, apply, pending, error, stop, isStopping, beginHold, endHold, hold };
};
