import { z } from 'zod';
import type { RequestPermissionRequest } from '@agentclientprotocol/sdk';
import type { JsonValue } from '@taucad/agent-host';
import { providerPermissionObservationSchema } from '@taucad/agent-host/wire';
import type { ProviderPermission, ProviderPermissionObservation } from '@taucad/agent-host/wire';
import type { AcpAdapter } from '#acp/registry.js';

const credentialKeys = new Set([
  'authorization',
  'cookie',
  'setcookie',
  'password',
  'passwd',
  'secret',
  'clientsecret',
  'token',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'apikey',
  'xapikey',
  'credentials',
  'privatekey',
]);

/**
 * Drop opaque provider metadata and credential fields before recording permission presentation.
 * This does not classify arbitrary prose or make the resulting record an authority.
 * @internal
 * @param value - JSON presentation facts.
 * @returns The facts with metadata omitted and recognized credentials redacted.
 */
export const redactPermissionMetadata = (value: JsonValue): JsonValue => {
  if (Array.isArray(value)) {
    return value.map((item: JsonValue) => redactPermissionMetadata(item));
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  const headerName = 'name' in value ? value['name'] : undefined;
  const credentialHeader =
    typeof headerName === 'string' && credentialKeys.has(headerName.replaceAll(/[_-]/gu, '').toLowerCase());
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) => {
      if (key === '_meta') {
        return [];
      }
      return [
        [
          key,
          (credentialHeader && key === 'value') || credentialKeys.has(key.replaceAll(/[_-]/gu, '').toLowerCase())
            ? '[redacted]'
            : redactPermissionMetadata(item),
        ],
      ];
    }),
  );
};

/**
 * Interpret reviewed provider options without claiming the provider committed a policy.
 * @internal
 * @param request - Permission request from the current connection.
 * @param adapter - Host-resolved adapter identity, never request-supplied identity.
 * @param readback - Connection-negotiated or host-qualified settings reader facts for this exact request.
 * @returns Safe permission presentation facts for the durable interrupt.
 */
export const providerPermissionPayload = (
  request: RequestPermissionRequest,
  adapter: Pick<AcpAdapter, 'id' | 'package' | 'version'>,
  readback: { readonly negotiated?: boolean | undefined; readonly localPrepared?: boolean | undefined } = {},
): JsonValue => {
  // Codex ACP v1.7.0 permissions/mcp.ts: both session and always use ACP allow_always.
  const codexMcp =
    adapter.id === 'codex' &&
    adapter.package === '@agentclientprotocol/codex-acp' &&
    adapter.version === '1.7.0' &&
    request._meta?.['is_mcp_tool_approval'] === true;
  const unsupported =
    codexMcp &&
    readback.negotiated &&
    z
      .object({
        version: z.literal(1),
        support: z.literal('unsupported'),
        reason: z.literal('unconfigured-mcp-server'),
      })
      .safeParse(request.toolCall._meta?.['tau/permissionPersistence']).success;
  const grokQualified = adapter.id === 'grok' && readback.localPrepared;
  const providerPermission: ProviderPermission = {
    owner: 'provider',
    persistence: 'unverified',
    ...(codexMcp && readback.negotiated ? { readback: unsupported ? 'unsupported' : 'config-layers' } : {}),
    ...(grokQualified ? { readback: 'permission-file' } : {}),
    ...(unsupported ? { unsupportedReason: 'unconfigured-mcp-server' } : {}),
    options: request.options.map((option) => ({
      optionId: option.optionId,
      requestedScope: codexMcp
        ? option.kind === 'allow_once' || option.kind === 'reject_once'
          ? 'once'
          : option.kind === 'allow_always' && option.optionId === 'allow_session'
            ? 'session'
            : option.kind === 'allow_always' && option.optionId === 'allow_always'
              ? 'persistent'
              : 'unspecified'
        : grokQualified
          ? option.kind === 'allow_once' || option.kind === 'reject_once'
            ? 'once'
            : option.kind === 'allow_always' && option.optionId === 'always-allow'
              ? 'persistent'
              : 'unspecified'
          : 'unspecified',
    })),
  };
  const { toolCall } = request;
  return redactPermissionMetadata(
    z.json().parse({
      toolCall: {
        toolCallId: toolCall.toolCallId,
        ...(toolCall.title === undefined ? {} : { title: toolCall.title }),
        ...(toolCall.kind === undefined ? {} : { kind: toolCall.kind }),
        ...(toolCall.status === undefined ? {} : { status: toolCall.status }),
        ...(toolCall.rawInput === undefined ? {} : { rawInput: toolCall.rawInput }),
        ...(toolCall.content === undefined ? {} : { content: toolCall.content }),
        ...(toolCall.locations === undefined ? {} : { locations: toolCall.locations }),
      },
      options: request.options.map(({ optionId, name, kind }) => ({
        optionId,
        name:
          grokQualified && request.toolCall.kind === 'execute' && optionId === 'always-allow' && kind === 'allow_always'
            ? 'Allow this command in future'
            : name,
        kind,
      })),
      providerPermission,
    }),
  );
};

/** The optional readback extension advertised by a reviewed adapter. @internal */
export const permissionReadbackCapability = { version: 1, readback: 'config-layers', families: ['mcp-tool'] } as const;

/**
 * Negotiate the reviewed extension without trusting request-supplied provider identities.
 * @internal
 * @param adapter - Host-resolved adapter.
 * @param metadata - Initialize response extension value.
 * @returns Whether this connection supports the reviewed narrow readback.
 */
export const supportsPermissionReadback = (
  adapter: Pick<AcpAdapter, 'id' | 'package' | 'version'>,
  metadata: unknown,
): boolean =>
  adapter.id === 'codex' &&
  adapter.package === '@agentclientprotocol/codex-acp' &&
  adapter.version === '1.7.0' &&
  z
    .object({
      version: z.literal(1),
      readback: z.literal('config-layers'),
      families: z.array(z.string()).refine((families) => families.includes('mcp-tool')),
    })
    .safeParse(metadata).success;

/**
 * Read only the bounded extension fields; opaque provider metadata never becomes a receipt.
 * @internal
 * @param metadata - One tool-call update extension.
 * @returns Parsed readback, or undefined for malformed or incompatible metadata.
 */
export const permissionObservationOf = (metadata: unknown): ProviderPermissionObservation | undefined =>
  providerPermissionObservationSchema.safeParse(metadata).data;
