import { useCallback, useEffect, useRef, useState } from 'react';
import { checkMachineAction, machineActionIntent } from '@taucad/runtime/machine';
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

/** The lease behind a press: its component, granted id, renewal timer, release listeners and whether it ended. */
type HoldLease = {
  componentId: string;
  holdId?: string;
  timer?: ReturnType<typeof setInterval>;
  unlisten?: () => void;
  released: boolean;
};

/**
 * Whether a hold in force may keep renewing on the machine as now observed. A machine moving under the hold reports
 * itself active; that is the hold itself, so the check reads it as ready.
 *
 * @param entry - The machine as observed.
 * @param componentId - The held component.
 * @returns The check, as for a new press.
 */
const checkHeld = (entry: MachineDirectoryEntry, componentId: string): MachineActionCheck => {
  const { state } = entry.snapshot;
  const moving: MachineDirectoryEntry['snapshot'] | undefined =
    state.status === 'active' ? { ...entry.snapshot, state: { ...state, status: 'ready' } } : undefined;
  const result = checkMachineAction({
    entry: moving === undefined ? entry : { ...entry, snapshot: moving },
    componentId,
    action: 'motion.jog',
    kind: 'hold',
    caller: 'person',
    attended: true,
    now: Date.now(),
  });
  return entry.freshness === 'current' || result.status === 'unavailable'
    ? result
    : {
        status: 'unavailable',
        code: 'MACHINE_ACTION_STALE_OBSERVATION',
        message: `No current observation from ${entry.name}.`,
      };
};

/** Every control the pane offers, sent the one way the contract allows. @public */
export type MachineControl = Readonly<{
  entry: MachineDirectoryEntry;
  attended: boolean;
  /** Change the person's presence; what a control that asks inline calls. */
  setAttended: (attended: boolean) => void;
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
 * as the presence says) and then `applyAction` with the intent {@link machineActionIntent} builds from what the person
 * saw; `stop` as its own operation, never waiting on another; and jog holds renewed every half lease until released
 * anywhere on the page, the page is hidden, or the hold's own check fails.
 *
 * @param input - The client, the machine as observed, the presence, how to change it and what to call when a control
 * is used.
 * @returns The controls.
 * @public
 */
export const useMachineControl = ({
  client,
  entry,
  attended,
  setAttended,
  onUsed,
}: {
  readonly client: MachineClient;
  readonly entry: MachineDirectoryEntry;
  readonly attended: boolean;
  readonly setAttended: (attended: boolean) => void;
  readonly onUsed?: () => void;
}): MachineControl => {
  const [pending, setPending] = useState<string>();
  const [error, setError] = useState<string>();
  /* Stops in flight: each press is its own operation, so a second press never waits for the first. */
  const [stopping, setStopping] = useState(0);
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
    if (!('scope' in descriptor)) {
      return false;
    }
    onUsed?.();
    setPending(`${componentId}:${action}`);
    setError(undefined);
    try {
      const receipt = await client.applyAction(
        machineActionIntent(entry, descriptor, {
          operationId: randomUuid(),
          parameters,
          requestedBy: operator,
          attended,
        }),
      );
      if (receipt.status === 'rejected') {
        setError(receipt.message);
      } else if (receipt.status === 'unknown') {
        setError(
          `${entry.name} did not answer, so Tau cannot tell whether it took “${descriptor.label}”. Nothing is resent; History shows it once the machine reports.`,
        );
      }
      return receipt.status === 'accepted';
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : String(error_));
      return false;
    } finally {
      setPending(undefined);
    }
  };

  const stop = async (): Promise<void> => {
    setStopping((count) => count + 1);
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
    } catch (error_) {
      setError(
        `${error_ instanceof Error ? error_.message : String(error_)} Use the machine’s own stop if it is still moving.`,
      );
    } finally {
      setStopping((count) => count - 1);
    }
  };

  /* Ends a granted lease. One the machine already ended needs no word; any other failure is said, and the machine
   * stops by itself once the lease runs out. */
  const release = useCallback(
    async (holdId: string): Promise<void> => {
      try {
        await client.endHold({ holdId });
      } catch (error_) {
        const message = error_ instanceof Error ? error_.message : String(error_);
        if (!message.includes('MACHINE_HOLD_ENDED')) {
          setError(
            `${entry.name} did not confirm the end of the jog (${message}); it stops by itself when the hold lapses.`,
          );
        }
      }
    },
    [client, entry.name],
  );

  const endHold = useCallback((): void => {
    const { current } = holdRef;
    if (current === undefined) {
      return;
    }
    current.released = true;
    holdRef.current = undefined;
    setHold(undefined);
    globalThis.clearInterval(current.timer);
    current.unlisten?.();
    const { holdId } = current;
    if (holdId !== undefined) {
      // async-iife: release -- the press ended; the release reports its own failure.
      void release(holdId);
    }
  }, [release]);

  /* A held control lets go when what it needs stops holding: stale, disconnected, alarm, an interlock. */
  useEffect(() => {
    const { current } = holdRef;
    if (current === undefined) {
      return;
    }
    const result = checkHeld(entry, current.componentId);
    if (result.status === 'unavailable') {
      endHold();
      setError(`${entry.name} stopped the jog: ${result.message}`);
    }
  }, [entry, endHold]);

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
    const current: HoldLease = { componentId, released: false };
    holdRef.current = current;
    setHold({ parameters });
    /* The press ends wherever it is let go: a disabled or moved-away button may never see its own release. */
    const letGo = (): void => {
      if (holdRef.current === current) {
        endHold();
      }
    };
    const hidden = (): void => {
      if (document.visibilityState === 'hidden') {
        letGo();
      }
    };
    const releases = ['pointerup', 'pointercancel', 'keyup', 'blur'] as const;
    for (const type of releases) {
      globalThis.addEventListener(type, letGo);
    }
    document.addEventListener('visibilitychange', hidden);
    current.unlisten = () => {
      for (const type of releases) {
        globalThis.removeEventListener(type, letGo);
      }
      document.removeEventListener('visibilitychange', hidden);
    };
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
          await release(granted.holdId);
          return;
        }
        current.timer = globalThis.setInterval(() => {
          const renew = async (): Promise<void> => {
            try {
              const renewed = await client.renewHold({ holdId: granted.holdId });
              if (renewed.status === 'ended' && holdRef.current === current) {
                current.holdId = undefined;
                endHold();
                setError(`${entry.name} ended the jog.`);
              }
            } catch (error_) {
              // The machine stops within its bound once renewals stop; the pad lets go and says why.
              if (holdRef.current === current) {
                endHold();
                setError(`${entry.name} ended the jog: ${error_ instanceof Error ? error_.message : String(error_)}`);
              }
            }
          };
          // async-iife: lease -- each renewal stands alone; the next one follows on the interval.
          void renew();
        }, granted.lease / 2);
      } catch (error_) {
        setError(error_ instanceof Error ? error_.message : String(error_));
        if (holdRef.current === current) {
          endHold();
        }
      }
    };
    // async-iife: hold -- the press starts now; renewals follow while it lasts.
    void begin();
  };

  useEffect(() => endHold, [endHold]);

  return {
    entry,
    attended,
    setAttended,
    check,
    apply,
    pending,
    error,
    stop,
    isStopping: stopping > 0,
    beginHold,
    endHold,
    hold,
  };
};
