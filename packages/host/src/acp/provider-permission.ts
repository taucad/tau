import { z } from 'zod';
import type { RequestPermissionRequest } from '@agentclientprotocol/sdk';
import type { JsonValue } from '@taucad/agent-host';
import type { ProviderPermission } from '@taucad/agent-host/wire';
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
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) => {
      if (key === '_meta') {
        return [];
      }
      return [
        [
          key,
          credentialKeys.has(key.replaceAll(/[_-]/gu, '').toLowerCase())
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
 * @returns Safe permission presentation facts for the durable interrupt.
 */
export const providerPermissionPayload = (
  request: RequestPermissionRequest,
  adapter: Pick<AcpAdapter, 'id' | 'package' | 'version'>,
): JsonValue => {
  // Codex ACP v1.7.0 permissions/mcp.ts: both session and always use ACP allow_always.
  const codexMcp =
    adapter.id === 'codex' &&
    adapter.package === '@agentclientprotocol/codex-acp' &&
    adapter.version === '1.7.0' &&
    request._meta?.['is_mcp_tool_approval'] === true;
  const providerPermission: ProviderPermission = {
    owner: 'provider',
    persistence: 'unverified',
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
      options: request.options.map(({ optionId, name, kind }) => ({ optionId, name, kind })),
      providerPermission,
    }),
  );
};
