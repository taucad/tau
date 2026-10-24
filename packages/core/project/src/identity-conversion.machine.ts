/** The host retains original/candidate bytes; this machine orders durable identity before checked replacement. */
import { createAsyncLogic, setup, types } from 'xstate';
import type { AsyncActorLogic } from 'xstate';
import type { ProjectIdentityResult } from '#identity.machine.js';

/** Preserved identity from validated prerelease manifest bytes. @public */
export type ProjectManifestConversionInput = Readonly<{ projectId: string }>;
/** Checked manifest replacement outcome. @public */
export type ProjectManifestReplacementResult = 'converted' | 'unchanged' | 'conflict';
/** Conversion always preserves source bytes when identity could not be established. @public */
export type ProjectManifestConversionResult =
  | Readonly<{ status: ProjectManifestReplacementResult }>
  | Readonly<{ status: 'failed'; message: string }>;
/** Host effects retain byte buffers and implement authority-fenced replacement. @public */
export type ProjectManifestConversionActors = Readonly<{
  establishIdentity: AsyncActorLogic<ProjectIdentityResult, ProjectManifestConversionInput>;
  replaceManifest: AsyncActorLogic<ProjectManifestReplacementResult, ProjectManifestConversionInput>;
}>;
/** Small serializable conversion state. @public */
export type ProjectManifestConversionContext = Readonly<{
  input: ProjectManifestConversionInput;
  result: ProjectManifestConversionResult;
}>;
const failure = (error: unknown): ProjectManifestConversionResult => ({
  status: 'failed',
  message: error instanceof Error ? error.message : String(error),
});
const conversionDefinition = setup({
  schemas: {
    context: types<ProjectManifestConversionContext>(),
    input: types<ProjectManifestConversionInput>(),
    output: types<ProjectManifestConversionResult>(),
    events: { cancel: types<Record<never, never>>() },
  },
  actors: {
    establishIdentity: createAsyncLogic<ProjectIdentityResult, ProjectManifestConversionInput>({
      run: async () => {
        throw new Error('projectManifestConversionMachine: establishIdentity actor was not provided.');
      },
    }),
    replaceManifest: createAsyncLogic<ProjectManifestReplacementResult, ProjectManifestConversionInput>({
      run: async () => {
        throw new Error('projectManifestConversionMachine: replaceManifest actor was not provided.');
      },
    }),
  },
}).createMachine({
  id: 'projectManifestConversion',
  context: ({ input }) => ({ input, result: { status: 'unchanged' } }),
  initial: 'establishing',
  on: {
    cancel: {
      target: '.done',
      context: { result: { status: 'failed', message: 'Manifest conversion was canceled.' } },
    },
  },
  output: ({ context }) => context.result,
  onError: ({ event }) => ({ target: '.done', context: { result: failure(event.error) } }),
  states: {
    establishing: {
      invoke: {
        src: 'establishIdentity',
        input: ({ context }) => context.input,
        onDone: ({ context, event }) => {
          if (event.output.status === 'resolved' && event.output.projectId === context.input.projectId) {
            return { target: 'replacing' };
          }
          if (event.output.status === 'conflict' || event.output.status === 'resolved') {
            return { target: 'done', context: { result: { status: 'conflict' } } };
          }
          return {
            target: 'done',
            context: {
              result: {
                status: 'failed',
                message:
                  event.output.status === 'failed'
                    ? event.output.message
                    : 'Identity must be persisted before converting the manifest.',
              },
            },
          };
        },
        onError: ({ event }) => ({ target: 'done', context: { result: failure(event.error) } }),
      },
    },
    replacing: {
      invoke: {
        src: 'replaceManifest',
        input: ({ context }) => context.input,
        onDone: ({ event }) => ({ target: 'done', context: { result: { status: event.output } } }),
        onError: ({ event }) => ({ target: 'done', context: { result: failure(event.error) } }),
      },
    },
    done: { type: 'final' },
  },
});
type ConversionDefinition = typeof conversionDefinition;
/** Named declaration for the conversion lifecycle. @public */
// oxlint-disable-next-line typescript/no-empty-interface, typescript/no-empty-object-type, typescript/consistent-type-definitions -- named machine declaration prevents expansion.
export interface ProjectManifestConversionMachine extends ConversionDefinition {}
/** Preserve identity before replacing a prerelease manifest. @public */
export const projectManifestConversionMachine: ProjectManifestConversionMachine = conversionDefinition;
