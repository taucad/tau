/**
 * Portable identity initialization. Durable identity rehydrates from the injected
 * readIdentity actor; initialization is a host-owned atomic create-or-read.
 * No authored declaration or platform filesystem is owned by this machine.
 */
import { createAsyncLogic, setup, types } from 'xstate';
import type { AsyncActorLogic, AnyActorRef } from 'xstate';
import { projectIdentitySchema } from '#identity-record.js';
import type { ProjectIdentityRecord } from '#identity-record.js';
import { projectIdSchema } from '#project-manifest.js';

/** One physical storage location; hosts canonicalize it before requesting identity. @public */
export type ProjectIdentityLocation = Readonly<{ locationKey: string }>;
/** Resolve existing identity or atomically initialize it. @public */
export type ProjectIdentityInput = ProjectIdentityLocation &
  Readonly<{
    mode: 'read' | 'ensure';
    preferredProjectId?: string;
    initialIdentity?: Readonly<{ record: ProjectIdentityRecord | undefined }>;
    /** Internal coordinator response port, supplied only when spawned by the shared resolver. */
    parent?: Readonly<{ ref: AnyActorRef; key: string; token: number }>;
  }>;
/** Terminal outcome; a race never silently changes an established identity. @public */
export type ProjectIdentityResult =
  | Readonly<{ status: 'resolved'; projectId: string }>
  | Readonly<{ status: 'missing' }>
  | Readonly<{ status: 'conflict'; expectedProjectId: string; actualProjectId: string }>
  | Readonly<{ status: 'failed'; message: string }>;
/** Atomic initialization input. Return the winning record instead of overwriting one. @public */
export type InitializeProjectIdentityInput = ProjectIdentityLocation & Readonly<{ projectId: string }>;
/** Host-supplied persistence and random generation actors. @public */
export type ProjectIdentityActors = Readonly<{
  readIdentity: AsyncActorLogic<ProjectIdentityRecord | undefined, ProjectIdentityLocation>;
  mintIdentity: AsyncActorLogic<string, ProjectIdentityLocation>;
  initializeIdentity: AsyncActorLogic<ProjectIdentityRecord, InitializeProjectIdentityInput>;
}>;
/** Serializable state for a single resolution operation. @public */
export type ProjectIdentityContext = Readonly<{
  input: ProjectIdentityInput;
  candidate: string | undefined;
  result: ProjectIdentityResult;
}>;

const failure = (error: unknown): ProjectIdentityResult => ({
  status: 'failed',
  message: error instanceof Error ? error.message : String(error),
});
const resultFor = (record: ProjectIdentityRecord, preferred: string | undefined): ProjectIdentityResult => {
  const parsed = projectIdentitySchema.safeParse(record);
  if (!parsed.success) {
    return { status: 'failed', message: 'The persisted project identity is invalid.' };
  }
  return preferred !== undefined && parsed.data.projectId !== preferred
    ? { status: 'conflict', expectedProjectId: preferred, actualProjectId: parsed.data.projectId }
    : { status: 'resolved', projectId: parsed.data.projectId };
};

/**
 * Resolve supplied current evidence without allocating a child actor.
 * @internal
 * @param input - Request and optional current identity evidence.
 * @returns A terminal result when evidence suffices, otherwise undefined.
 */
export const knownProjectIdentityResult = (input: ProjectIdentityInput): ProjectIdentityResult | undefined => {
  if (input.preferredProjectId !== undefined && !projectIdSchema.safeParse(input.preferredProjectId).success) {
    return { status: 'failed', message: 'The supplied project identity is invalid.' };
  }
  if (input.initialIdentity === undefined) {
    return undefined;
  }
  const { record } = input.initialIdentity;
  if (record !== undefined) {
    return resultFor(record, input.preferredProjectId);
  }
  return input.mode === 'read' ? { status: 'missing' } : undefined;
};

const identityDefinition = setup({
  schemas: {
    context: types<ProjectIdentityContext>(),
    input: types<ProjectIdentityInput>(),
    output: types<ProjectIdentityResult>(),
    events: { cancel: types<Record<never, never>>() },
    emitted: { settled: types<{ result: ProjectIdentityResult }>() },
  },
  actors: {
    readIdentity: createAsyncLogic<ProjectIdentityRecord | undefined, ProjectIdentityLocation>({
      run: async () => {
        throw new Error('projectIdentityMachine: readIdentity actor was not provided.');
      },
    }),
    mintIdentity: createAsyncLogic<string, ProjectIdentityLocation>({
      run: async () => {
        throw new Error('projectIdentityMachine: mintIdentity actor was not provided.');
      },
    }),
    initializeIdentity: createAsyncLogic<ProjectIdentityRecord, InitializeProjectIdentityInput>({
      run: async () => {
        throw new Error('projectIdentityMachine: initializeIdentity actor was not provided.');
      },
    }),
  },
}).createMachine({
  id: 'projectIdentity',
  context: ({ input }) => ({ input, candidate: undefined, result: { status: 'missing' } }),
  initial: 'checking',
  output: ({ context }) => context.result,
  onError: ({ event }) => ({ target: '.done', context: { result: failure(event.error) } }),
  on: {
    cancel: {
      target: '.done',
      context: { result: { status: 'failed', message: 'Identity resolution was canceled.' } },
    },
  },
  states: {
    checking: {
      always: ({ context }) => {
        const known = knownProjectIdentityResult(context.input);
        if (known !== undefined) {
          return { target: 'done', context: { result: known } };
        }
        return { target: context.input.initialIdentity === undefined ? 'reading' : 'missing' };
      },
    },
    reading: {
      invoke: {
        src: 'readIdentity',
        input: ({ context }) => ({ locationKey: context.input.locationKey }),
        onDone: ({ context, event }) =>
          event.output === undefined
            ? { target: 'missing' }
            : { target: 'done', context: { result: resultFor(event.output, context.input.preferredProjectId) } },
        onError: ({ event }) => ({ target: 'done', context: { result: failure(event.error) } }),
      },
    },
    missing: {
      always: ({ context }) => {
        if (context.input.mode === 'read') {
          return { target: 'done' };
        }
        return context.input.preferredProjectId === undefined
          ? { target: 'minting' }
          : { target: 'initializing', context: { candidate: context.input.preferredProjectId } };
      },
    },
    minting: {
      invoke: {
        src: 'mintIdentity',
        input: ({ context }) => ({ locationKey: context.input.locationKey }),
        onDone: ({ event }) => {
          const parsed = projectIdSchema.safeParse(event.output);
          return parsed.success
            ? { target: 'initializing', context: { candidate: parsed.data } }
            : {
                target: 'done',
                context: { result: { status: 'failed', message: 'The generated project identity is invalid.' } },
              };
        },
        onError: ({ event }) => ({ target: 'done', context: { result: failure(event.error) } }),
      },
    },
    initializing: {
      invoke: {
        src: 'initializeIdentity',
        input: ({ context }) => ({ locationKey: context.input.locationKey, projectId: context.candidate ?? '' }),
        onDone: ({ context, event }) => ({
          target: 'done',
          context: { result: resultFor(event.output, context.input.preferredProjectId) },
        }),
        onError: ({ event }) => ({ target: 'done', context: { result: failure(event.error) } }),
      },
    },
    done: {
      type: 'final',
      entry: ({ context }, enq) => {
        enq.emit({ type: 'settled', result: context.result });
        const { parent } = context.input;
        if (parent !== undefined) {
          enq.sendTo(parent.ref, { type: 'settled', key: parent.key, token: parent.token, result: context.result });
        }
      },
    },
  },
});
type IdentityDefinition = typeof identityDefinition;
/** Named machine contract prevents expanded declaration output. @public */
// oxlint-disable-next-line typescript/no-empty-interface, typescript/no-empty-object-type, typescript/consistent-type-definitions -- named machine declaration prevents expansion.
export interface ProjectIdentityMachine extends IdentityDefinition {}
/** Shared resolution and atomic initialization lifecycle. @public */
export const projectIdentityMachine: ProjectIdentityMachine = identityDefinition;
