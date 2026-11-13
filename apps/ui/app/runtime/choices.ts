/**
 * `choices`: the device's standing choices a project runtime reads, as one callback actor (app state orchestration
 * charter D4, D8; plan § 4 A6a; inventory rows S32, S35).
 *
 * It emits compute placement and its selection revision, compute reuse and its revision, the default execution, the
 * model catalog that model resolution reads, the model-pinning flag, the default kernel and the testing cookie. Compute
 * placement and reuse are module stores in `@taucad/ui-core`. Everything else arrives through four ports, because the
 * default execution and model resolution are not stores: today `useModels` derives them from cookies, a flag, the
 * catalog query and `usePlaceableExecution` (`hooks/use-models.tsx`). The derivations are the ones `useModels` calls:
 * `resolveNewChatExecution`, `catalogDefaultModelId` and the placeable fallback (`withoutHostId`).
 *
 * The actor holds every subscription in its closure and sends its parent one `choicesChanged` with the new values when
 * it starts and once for each change a port or store reports. Stopping the actor releases every subscription. Nothing
 * here keeps a timer.
 *
 * @module
 */
import { createCallbackLogic } from 'xstate';
import type { CallbackActorLogic } from 'xstate';
import type { CadAgentExecution, TauAgentExecution } from '@taucad/chat';
import { reasoningLevels } from '@taucad/chat/constants';
import { cadAgentExecutionSchema } from '@taucad/chat/schemas';
import { resolveNewChatExecution } from '@taucad/chat-ui/utils/new-chat-execution';
import { withoutHostId } from '@taucad/chat-ui/utils/chat-execution';
import { cookieName } from '@taucad/ui-core/constants/cookie.constants';
import {
  getRemoteComputePlacement,
  getRemoteComputeSelectionRevision,
  subscribeRemoteComputePlacement,
} from '@taucad/ui-core/lib/remote-compute-placement';
import type { RemoteComputePlacement } from '@taucad/ui-core/lib/remote-compute-placement';
import {
  getComputeReuseMode,
  getComputeReuseRevision,
  subscribeComputeReusePreference,
} from '@taucad/ui-core/lib/compute-reuse-preference';
import type { ComputeReuseMode } from '@taucad/ui-core/lib/compute-reuse-preference';
import type { KernelId } from '@taucad/types/constants';
import { catalogDefaultModelId } from '#hooks/use-models.js';
import { resolveRememberedKernel } from '#hooks/use-kernel.js';
import type { Model } from '#lib/model-catalog.js';

/** The cookies `choices` reads: the remembered execution, Tau model and level, the testing cookie and the kernel. */
export const choicesCookieNames = [
  cookieName.chatExecution,
  cookieName.chatModel,
  cookieName.chatEffort,
  cookieName.chatTestingEnabled,
  cookieName.cadKernel,
] as const;

export type ChoicesCookieName = (typeof choicesCookieNames)[number];

/**
 * The device's stored preferences. `read` returns a cookie's stored value as `useCookie` parses it, or `undefined`
 * when nothing is stored; `subscribe` calls the listener on each change of that one cookie.
 */
export type ChoicesCookiesPort = Readonly<{
  read: (name: ChoicesCookieName) => unknown;
  subscribe: (name: ChoicesCookieName, listener: () => void) => () => void;
}>;

/** The model catalog as the API last answered it, with the full rows model resolution reads. */
export type ChoicesModelCatalog =
  | Readonly<{ status: 'loading' }>
  | Readonly<{ status: 'unavailable' }>
  | Readonly<{ status: 'loaded'; models: readonly Model[] }>;

/** The current model catalog and its changes; today the models query, refetched every five minutes. */
export type ChoicesCatalogPort = Readonly<{
  read: () => ChoicesModelCatalog;
  subscribe: (listener: () => void) => () => void;
}>;

/** The flags `choices` reads. */
export type ChoicesFlag = 'modelPinning';

/** Feature flags: whether one is on, and its changes. */
export type ChoicesFlagsPort = Readonly<{
  read: (flag: ChoicesFlag) => boolean;
  subscribe: (flag: ChoicesFlag, listener: () => void) => () => void;
}>;

/**
 * Which hosts this tab can place an execution on. `isPlaceable` is false for an execution that names a host this tab
 * was never handed (today `namesUnhandedLoopbackHost`); `subscribe` reports each change of what the tab reaches.
 */
export type ChoicesReachabilityPort = Readonly<{
  isPlaceable: (execution: CadAgentExecution) => boolean;
  subscribe: (listener: () => void) => () => void;
}>;

/** The four ports `choices` reads. A6b supplies the real ones; tests pass fakes. */
export type ChoicesPorts = Readonly<{
  cookies: ChoicesCookiesPort;
  catalog: ChoicesCatalogPort;
  flags: ChoicesFlagsPort;
  reachability: ChoicesReachabilityPort;
}>;

/** What `choices` emits. Every value is plain data. */
export type ProjectChoices = Readonly<{
  computePlacement: RemoteComputePlacement;
  computeSelectionRevision: number;
  computeReuseMode: ComputeReuseMode;
  computeReuseRevision: number;
  /** The execution a chat with none of its own starts on, as this tab can place it. */
  defaultExecution: CadAgentExecution;
  /** The catalog model resolution reads: a model id resolves against its rows. */
  modelCatalog: ChoicesModelCatalog;
  /** Whether model pinning is on. */
  modelPinning: boolean;
  /** The concrete kernel a project falls back to when it has none of its own. */
  defaultKernel: KernelId;
  /** The testing cookie, on unless the person turned it off. */
  testingEnabled: boolean;
}>;

/** The one event `choices` sends its parent. */
export type ChoicesChangedEvent = Readonly<{ type: 'choicesChanged'; choices: ProjectChoices }>;

/** A stored execution is untrusted: one that fails the wire schema would fail the turn. */
const parseStoredExecution = (value: unknown): CadAgentExecution | undefined => {
  const parsed = cadAgentExecutionSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
};

/**
 * The default execution, as `useModels` derives it: the last execution used, else the last Tau model and level (the
 * stored model, else the catalog's default), resolved against the catalog and then placed on a host this tab reaches.
 */
const readDefaultExecution = (ports: ChoicesPorts, catalog: ChoicesModelCatalog): CadAgentExecution => {
  const storedModelId = ports.cookies.read(cookieName.chatModel);
  const storedEffort = ports.cookies.read(cookieName.chatEffort);
  const selectedEffort = reasoningLevels.find((level) => level === storedEffort);
  const selectedModelId =
    (typeof storedModelId === 'string' ? storedModelId : undefined) ??
    catalogDefaultModelId(catalog.status === 'loaded' ? catalog.models : undefined) ??
    '';
  const lastTau: TauAgentExecution = {
    kind: 'tau',
    model: selectedModelId,
    ...(selectedEffort === undefined ? {} : { effort: selectedEffort }),
  };
  const execution = resolveNewChatExecution({
    last: parseStoredExecution(ports.cookies.read(cookieName.chatExecution)),
    lastTau,
    catalog,
  });
  return !ports.reachability.isPlaceable(execution) && execution.kind === 'tau' ? withoutHostId(execution) : execution;
};

/**
 * Read every choice now.
 *
 * @param ports - The four ports.
 * @returns The current values.
 */
export const readChoices = (ports: ChoicesPorts): ProjectChoices => {
  const modelCatalog = ports.catalog.read();
  const testingEnabled = ports.cookies.read(cookieName.chatTestingEnabled);
  return {
    computePlacement: getRemoteComputePlacement(),
    computeSelectionRevision: getRemoteComputeSelectionRevision(),
    computeReuseMode: getComputeReuseMode(),
    computeReuseRevision: getComputeReuseRevision(),
    defaultExecution: readDefaultExecution(ports, modelCatalog),
    modelCatalog,
    modelPinning: ports.flags.read('modelPinning'),
    defaultKernel: resolveRememberedKernel({ raw: ports.cookies.read(cookieName.cadKernel) }).kernel,
    testingEnabled: typeof testingEnabled === 'boolean' ? testingEnabled : true,
  };
};

/** `choices` takes no events. */
export type ChoicesActorEvent = Readonly<{ type: 'never' }>;

export type ChoicesLogic = CallbackActorLogic<ChoicesActorEvent, undefined>;

/**
 * Build the `choices` actor logic over its ports. The ports live in this closure, never in a machine's context (D4).
 *
 * @param ports - The four ports.
 * @returns Callback logic that sends its parent a {@link ChoicesChangedEvent} at start and once per change.
 */
export const createChoicesLogic = (ports: ChoicesPorts): ChoicesLogic =>
  createCallbackLogic<ChoicesActorEvent, undefined>(({ sendBack }) => {
    const changed = (): void => {
      const event: ChoicesChangedEvent = { type: 'choicesChanged', choices: readChoices(ports) };
      sendBack(event);
    };
    const subscriptions = [
      subscribeRemoteComputePlacement(changed),
      subscribeComputeReusePreference(changed),
      ...choicesCookieNames.map((name) => ports.cookies.subscribe(name, changed)),
      ports.catalog.subscribe(changed),
      ports.flags.subscribe('modelPinning', changed),
      ports.reachability.subscribe(changed),
    ];
    changed();
    return () => {
      for (const unsubscribe of subscriptions) {
        unsubscribe();
      }
    };
  });
