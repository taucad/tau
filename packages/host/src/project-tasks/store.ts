import type { z } from 'zod';
import { createActor } from 'xstate';
import { projectTaskProjectionLogic } from '#project-tasks/projection.js';
import { projectTaskRecordSchema } from '@taucad/agent-host/wire';
import type { ProjectTask, ProjectTaskMessage, ProjectTaskRefusalCode } from '@taucad/agent-host/wire';

/** Typed task refusal preserves stable codes across tool/UI boundaries. @internal */
export class ProjectTaskError extends Error {
  public readonly code: ProjectTaskRefusalCode;

  /** Construct a task refusal. @param code - Stable reason. @param message - Actionable detail. */
  public constructor(code: ProjectTaskRefusalCode, message: string) {
    super(message);
    this.name = 'ProjectTaskError';
    this.code = code;
  }
}

/** A project ordering authority's append. @internal */
export type ProjectTaskRecord = z.infer<typeof projectTaskRecordSchema>;
/** A prepared change becomes visible only after append-and-sync acknowledges. @internal */
export type ProjectTaskChange = Omit<ProjectTaskRecord, 'version' | 'projectId' | 'sequence'>;
/** Environment storage with owner-qualified exclusive append-and-sync. @internal */
export type ProjectTaskStorage = Readonly<{
  read: () => Promise<Uint8Array<ArrayBuffer>>;
  append: (bytes: Uint8Array<ArrayBuffer>) => Promise<void>;
  truncate: (size: number) => Promise<void>;
  size: () => Promise<number>;
  exclusive: <Result>(section: () => Promise<Result>) => Promise<Result>;
  close: () => Promise<void>;
}>;
/** One serialized project writer; transaction callbacks must not acquire resources. @internal */
export type ProjectTaskStore = Readonly<{
  projectId: string;
  transaction: <Result>(operation: (view: ProjectTaskStoreView) => Promise<Result>) => Promise<Result>;
  close: () => Promise<void>;
}>;
/** Current journal projection available inside the project writer's transaction. @internal */
export type ProjectTaskStoreView = Readonly<{
  tasks: ReadonlyMap<string, ProjectTask>;
  messages: readonly ProjectTaskMessage[];
  requests: ReadonlyMap<string, NonNullable<ProjectTaskRecord['request']>>;
  deliveries: ReadonlyMap<string, NonNullable<ProjectTaskRecord['delivery']>>;
  attemptDeliveries: ReadonlyMap<string, NonNullable<ProjectTaskRecord['delivery']>>;
  records: readonly ProjectTaskRecord[];
  sequence: number;
  append: (change: ProjectTaskChange) => Promise<ProjectTaskRecord>;
}>;

const encoder = new TextEncoder();

/**
 * Open a durable sidecar; complete invalid rows fail closed and torn final bytes are repaired on first append.
 *
 * @param options - Project identity and exclusively owned durable storage.
 * @returns The sole ordering authority for this project.
 * @internal
 */
const openProjectTaskStore = async (
  options: Readonly<{ projectId: string; storage: ProjectTaskStorage }>,
): Promise<ProjectTaskStore> => {
  const { projectId, storage } = options;
  let bytes = await storage.read();
  const lastNewline = bytes.lastIndexOf(10);
  let byteLength = lastNewline + 1;
  let tail = bytes.slice(byteLength);
  let poisoned = false;
  let closed = false;
  let queue = Promise.resolve();

  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, byteLength));
  const projection = createActor(projectTaskProjectionLogic);
  projection.start();
  const selectProjection = () => projection.getSnapshot().context;
  const apply = (record: ProjectTaskRecord): void => {
    projection.send({ type: 'append', record });
  };

  try {
    for (const line of text.split('\n').filter(Boolean)) {
      const record = projectTaskRecordSchema.parse(JSON.parse(line));
      if (
        record.projectId !== projectId ||
        record.sequence !== selectProjection().records.length + 1 ||
        record.tasks.some((task) => task.projectId !== projectId) ||
        (record.message && (record.message.projectId !== projectId || record.message.sequence !== record.sequence))
      ) {
        throw new Error('Project identity or ordering does not match.');
      }
      apply(record);
    }
  } catch (error) {
    projection.stop();
    throw new ProjectTaskError('TASK_STORAGE_INVALID', `Task records cannot be replayed: ${String(error)}`);
  }
  bytes = bytes.slice(0, byteLength);

  const append = async (change: ProjectTaskChange): Promise<ProjectTaskRecord> => {
    const record = projectTaskRecordSchema.parse({
      ...change,
      version: 1,
      projectId,
      sequence: selectProjection().records.length + 1,
    });
    if (
      record.tasks.some((task) => task.projectId !== projectId) ||
      (record.message && (record.message.projectId !== projectId || record.message.sequence !== record.sequence))
    ) {
      throw new ProjectTaskError('TASK_STORAGE_INVALID', 'A task append cannot change project identity or sequence.');
    }
    const serialized = encoder.encode(`${JSON.stringify(record)}\n`);
    await storage.exclusive(async () => {
      const disk = await storage.read();
      if (
        disk.byteLength !== byteLength + tail.byteLength ||
        !bytes.every((byte, index) => disk[index] === byte) ||
        !tail.every((byte, index) => disk[byteLength + index] === byte)
      ) {
        throw new ProjectTaskError('TASK_STORAGE_FENCED', 'The task journal changed outside its ordering authority.');
      }
      if (tail.byteLength > 0) {
        await storage.truncate(byteLength);
        tail = new Uint8Array();
      }
      try {
        await storage.append(serialized);
      } catch (error) {
        try {
          await storage.truncate(byteLength);
        } catch {
          poisoned = true;
          throw new ProjectTaskError(
            'TASK_STORAGE_POISONED',
            'Task append and rollback both failed; reopen after recovery.',
          );
        }
        throw error;
      }
    });
    const previous = bytes;
    bytes = new Uint8Array(previous.byteLength + serialized.byteLength);
    bytes.set(previous);
    bytes.set(serialized, previous.byteLength);
    byteLength += serialized.byteLength;
    apply(record);
    return record;
  };

  const transaction = async <Result>(operation: (view: ProjectTaskStoreView) => Promise<Result>): Promise<Result> => {
    const prior = queue;
    const next = Promise.withResolvers<void>();
    queue = next.promise;
    await prior;
    try {
      if (closed || poisoned) {
        throw new ProjectTaskError(closed ? 'TASK_CLOSED' : 'TASK_STORAGE_POISONED', 'The task store is unavailable.');
      }
      return await operation({
        get tasks() {
          return new Map(Object.entries(selectProjection().tasks));
        },
        get messages() {
          return selectProjection().messages;
        },
        get requests() {
          return new Map(Object.entries(selectProjection().requests));
        },
        get deliveries() {
          return new Map(Object.entries(selectProjection().deliveries));
        },
        get attemptDeliveries() {
          return new Map(Object.entries(selectProjection().attemptDeliveries));
        },
        get records() {
          return selectProjection().records;
        },
        get sequence() {
          return selectProjection().records.length;
        },
        append,
      });
    } finally {
      next.resolve();
    }
  };

  return {
    projectId,
    transaction,
    close: async () => {
      await queue;
      if (!closed) {
        closed = true;
        await storage.close();
        projection.stop();
      }
    },
  };
};

/**
 * Open task storage and release authority on every initialization failure, including malformed bytes.
 *
 * @param options - Project identity and exclusively owned append-and-sync storage.
 * @returns The project ordering authority.
 * @internal
 */
export const createProjectTaskStore = async (
  options: Readonly<{ projectId: string; storage: ProjectTaskStorage }>,
): Promise<ProjectTaskStore> => {
  try {
    return await openProjectTaskStore(options);
  } catch (error) {
    try {
      await options.storage.close();
    } catch (closeError) {
      throw new AggregateError([error, closeError], 'Task storage initialization and authority release failed.');
    }
    throw error;
  }
};
