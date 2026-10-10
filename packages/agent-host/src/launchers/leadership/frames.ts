/**
 * The cross-tab leadership frame (W6 RH-R7, guide question `envelope-names`). Every build must read every other
 * build's frame, so the envelope is loose (unknown fields pass) and `kind` is an open string: a kind this build does
 * not know is ignored, never a parse failure. The bodies are parsed here, at the adapter only (EQ5).
 */

import { z } from 'zod';

import { commandAnswerSchema } from '#wire/commands.schema.js';
import type { CommandAnswer, HostCommand } from '#wire/commands.schema.js';
import { sourceLiveEventSchema, readAnswerSchema, readRequestSchema } from '#wire/frames.schema.js';
import type { SourceLiveEvent } from '#waist/ports.js';
import type { ReadAnswer, ReadRequest } from '#wire/frames.schema.js';

/** The envelope every build reads. @internal */
export const leadershipFrameSchema = z.looseObject({
  /** W4's agent protocol version, the number the rpc hello carries as `wire`. */
  wire: z.number().int().positive(),
  /** The composition root's build identity, compared only for equality (W4 T5). */
  build: z.string().min(1),
  kind: z.string().min(1),
  chatId: z.string().min(1),
  /** The worker's `tabId` (RH-R5). */
  sender: z.string().min(1),
  /** The sender's integer term epoch (D5); for `cmd` and `es`, the epoch the frame addresses. */
  epoch: z.number().int().nonnegative(),
  body: z.unknown(),
});

/** One envelope. @internal */
export type LeadershipFrame = z.infer<typeof leadershipFrameSchema>;

const corr = z.string().min(1);

/** The bodies this build reads, by kind. */
const bodies = {
  hb: z.looseObject({ state: z.enum(['leading', 'released']) }),
  /* The command is the holder's own to read: an unreadable one is answered `COMMAND_UNREADABLE` (SC-R4). */
  cmd: z.looseObject({ corr, commandId: z.string().min(1), type: z.string().min(1), payload: z.unknown() }),
  ans: z.looseObject({ to: z.string().min(1), corr, answer: commandAnswerSchema }),
  es: z.looseObject({ corr, request: readRequestSchema }),
  en: z.looseObject({ to: z.string().min(1), corr, answer: readAnswerSchema }),
  live: z.looseObject({ event: sourceLiveEventSchema }),
} as const;

/** A frame this build understood, or why it did not. @internal */
export type LeadershipMessage =
  | Readonly<{ kind: 'hb'; sender: string; epoch: number; state: 'leading' | 'released'; foreign: boolean }>
  | Readonly<{ kind: 'cmd'; sender: string; epoch: number; corr: string; command: HostCommand; foreign: boolean }>
  | Readonly<{ kind: 'ans'; sender: string; epoch: number; to: string; corr: string; answer: CommandAnswer }>
  | Readonly<{ kind: 'es'; sender: string; epoch: number; corr: string; request: ReadRequest; foreign: boolean }>
  | Readonly<{ kind: 'en'; sender: string; epoch: number; to: string; corr: string; answer: ReadAnswer }>
  /** A live delta of the holder's run, for this worker's subscribers (SC-R15). */
  | Readonly<{ kind: 'live'; sender: string; epoch: number; event: SourceLiveEvent }>
  /** A `cmd` whose body this build cannot read: still answered (I15), with its return address if it has one. */
  | Readonly<{ kind: 'unreadable'; sender: string; epoch: number; corr?: string; commandId?: string }>;

/**
 * Parse one frame for a chat, as this build reads it.
 *
 * @param value - The raw `BroadcastChannel` data.
 * @param self - This worker's identity: its chat, sender, wire and build.
 * @returns The message, or `undefined` for another chat, this sender, a kind this build does not know, or a frame
 *   whose envelope does not parse.
 * @internal
 */
export const parseLeadershipFrame = (
  value: unknown,
  self: Readonly<{ chatId: string; sender: string; wire: number; build: string }>,
): LeadershipMessage | undefined => {
  const envelope = leadershipFrameSchema.safeParse(value).data;
  if (envelope === undefined || envelope.chatId !== self.chatId || envelope.sender === self.sender) {
    return undefined;
  }
  const { sender, epoch } = envelope;
  /* I32: another build's frame is read only for its return address and its heartbeat. */
  const foreign = envelope.wire !== self.wire || envelope.build !== self.build;
  switch (envelope.kind) {
    case 'hb': {
      const body = bodies.hb.safeParse(envelope.body).data;
      return body === undefined ? undefined : { kind: 'hb', sender, epoch, state: body.state, foreign };
    }
    case 'cmd': {
      const body = bodies.cmd.safeParse(envelope.body).data;
      if (body === undefined) {
        const loose = z
          .looseObject({ corr: corr.optional(), commandId: z.string().optional() })
          .safeParse(envelope.body).data;
        return {
          kind: 'unreadable',
          sender,
          epoch,
          ...(loose?.corr === undefined ? {} : { corr: loose.corr }),
          ...(loose?.commandId === undefined ? {} : { commandId: loose.commandId }),
        };
      }
      return {
        kind: 'cmd',
        sender,
        epoch,
        corr: body.corr,
        // The holder's command owner parses the payload strictly (SC-R4); the frame carries it as sent.
        // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the owner's strict parse is the check.
        command: { type: body.type, commandId: body.commandId, payload: body.payload } as HostCommand,
        foreign,
      };
    }
    case 'ans': {
      const body = bodies.ans.safeParse(envelope.body).data;
      return body === undefined || body.to !== self.sender
        ? undefined
        : { kind: 'ans', sender, epoch, to: body.to, corr: body.corr, answer: body.answer };
    }
    case 'es': {
      const body = bodies.es.safeParse(envelope.body).data;
      return body === undefined
        ? undefined
        : { kind: 'es', sender, epoch, corr: body.corr, request: body.request, foreign };
    }
    case 'en':
    case 'ef': {
      const body = bodies.en.safeParse(envelope.body).data;
      return body === undefined || body.to !== self.sender
        ? undefined
        : { kind: 'en', sender, epoch, to: body.to, corr: body.corr, answer: body.answer };
    }
    case 'live': {
      const body = foreign ? undefined : bodies.live.safeParse(envelope.body).data;
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the wire schema is the live event's.
      return body === undefined ? undefined : { kind: 'live', sender, epoch, event: body.event as SourceLiveEvent };
    }
    default: {
      return undefined;
    }
  }
};
