import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { agentRunStates } from '#database/schema.js';

export const createHostPairingSchema = z.object({
  deviceLabel: z.string().trim().min(1).max(100),
});
export class CreateHostPairingDto extends createZodDto(createHostPairingSchema) {}

export const approveHostPairingSchema = z.object({
  userCode: z.string().trim().min(4).max(16),
});
export class ApproveHostPairingDto extends createZodDto(approveHostPairingSchema) {}

export const exchangeHostPairingSchema = z.object({
  deviceCode: z.string().min(16).max(256),
});
export class ExchangeHostPairingDto extends createZodDto(exchangeHostPairingSchema) {}

export const createHostSessionSchema = z.object({
  runtimeVersion: z.string().min(1).max(100),
});
export class CreateHostSessionDto extends createZodDto(createHostSessionSchema) {}

export const updateHostDeviceSchema = z.object({
  label: z.string().trim().min(1).max(100),
});
export class UpdateHostDeviceDto extends createZodDto(updateHostDeviceSchema) {}

/**
 * Provision (or recover) the cloud host for one project.
 *
 * The project is the whole request: a cloud host is one container per owner and
 * project, so the same body twice is the same host twice.
 */
export const createCloudHostSchema = z.object({
  projectId: z.string().trim().min(1).max(128),
});
export class CreateCloudHostDto extends createZodDto(createCloudHostSchema) {}

/**
 * What a paired daemon can do beyond remote compute.
 *
 * Optional and additive: a daemon started without `--agent-port`, or one that
 * predates the field, simply advertises nothing and gets no agent grant.
 */
export const hostCapabilitiesSchema = z.object({
  agent: z
    .object({
      workspaceRoot: z.string().min(1),
      /**
       * External ACP agents the daemon knows about (W4-ACP), as the one
       * canonical descriptor (VSC1): the startable ones carry their probed
       * model list, and one whose adapter or CLI failed carries its refusal
       * code so the browser can say *why* a row is missing.
       *
       * Relayed verbatim — the API resolves no id against a catalog and stores
       * nothing — but bounded here, because every string is daemon-authored
       * text a browser will render. The shape mirrors
       * `externalAgentDescriptorSchema` in `@taucad/agent-host`; `apps/api` does
       * not depend on that package, so the bounds are restated here. The relay
       * owns no vocabulary: `refusal` is bounded, and the browser validates it
       * against the canonical code list at its own edge.
       */
      externalAgents: z
        .array(
          z.strictObject({
            id: z.string().min(1).max(64),
            displayName: z.string().min(1).max(64),
            models: z
              .array(z.strictObject({ id: z.string().min(1).max(128), name: z.string().min(1).max(128) }))
              .max(64)
              .default([]),
            defaultModel: z.string().min(1).max(128).optional(),
            refusal: z.string().min(1).max(64).optional(),
          }),
        )
        .max(16)
        .optional(),
      /**
       * Revision modes the daemon records a turn in (V17 / VSC5). Relayed
       * verbatim like the agent list: the composer offers its revision selector
       * from the placement's modes, so a field dropped here is a choice the
       * paired client silently loses.
       */
      revisions: z
        .array(z.enum(['direct', 'candidate']))
        .max(2)
        .optional(),
    })
    .optional(),
});

export type HostCapabilities = z.infer<typeof hostCapabilitiesSchema>;

export const hostControlMessageSchema = z.discriminatedUnion('type', [
  z.object({
    v: z.literal(1),
    type: z.literal('ready'),
    deviceId: z.string().min(1),
    runtimeVersion: z.string().min(1),
    capacity: z.number().int().positive(),
    capabilities: hostCapabilitiesSchema.optional(),
  }),
  z.object({ v: z.literal(1), type: z.literal('accept'), sessionId: z.string().min(1) }),
  z.object({
    v: z.literal(1),
    type: z.literal('reject'),
    sessionId: z.string().min(1),
    code: z.enum(['BUSY', 'CHILD_UNAVAILABLE', 'VERSION_MISMATCH']),
  }),
  /**
   * One run's identity and state, for the run directory (PH19 ruling 2).
   *
   * Identity only — no message, no tool call, no transcript: the canonical
   * record stays in the host's `events.jsonl`, and this frame exists so a client
   * that lost its page can discover the run and which host to tail.
   *
   * `projectId` is optional because the T0 wire carries no project identity: a
   * cloud host's project is known to the API from the device's own binding, and
   * a paired laptop's run simply has none.
   */
  z.object({
    v: z.literal(1),
    type: z.literal('run'),
    runId: z.string().min(1).max(128),
    chatId: z.string().min(1).max(128),
    projectId: z.string().min(1).max(128).optional(),
    state: z.enum(agentRunStates),
    updatedAt: z.iso.datetime(),
  }),
]);

export type HostControlMessage = z.infer<typeof hostControlMessageSchema>;
