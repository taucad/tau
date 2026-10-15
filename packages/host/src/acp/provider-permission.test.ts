/* eslint-disable @typescript-eslint/naming-convention -- provider wire and credential keys retain their original spellings. */
import { describe, expect, it } from 'vitest';
import type { RequestPermissionRequest } from '@agentclientprotocol/sdk';
import { providerPermissionPayload } from '#acp/provider-permission.js';

const codex = { id: 'codex', package: '@agentclientprotocol/codex-acp', version: '1.7.0' };
const request: RequestPermissionRequest = {
  sessionId: 'session-1',
  _meta: { is_mcp_tool_approval: true, token: 'request-secret' },
  toolCall: {
    toolCallId: 'call-1',
    title: 'Run tool?',
    _meta: { token: 'tool-secret' },
    rawInput: { path: 'part.scad', authorization: 'credential', nested: [{ api_key: 'nested-secret' }] },
  },
  options: [
    { optionId: 'allow_once', name: 'Allow', kind: 'allow_once' },
    { optionId: 'allow_session', name: 'Session', kind: 'allow_always' },
    { optionId: 'allow_always', name: 'Always', kind: 'allow_always', _meta: { token: 'option-secret' } },
    { optionId: 'cancel', name: 'Cancel', kind: 'reject_once' },
  ],
};

describe('provider permission presentation', () => {
  it('should distinguish reviewed Codex requested scopes without claiming any save', () => {
    const original = structuredClone(request);
    expect(providerPermissionPayload(request, codex)).toEqual({
      toolCall: {
        toolCallId: 'call-1',
        title: 'Run tool?',
        rawInput: { path: 'part.scad', authorization: '[redacted]', nested: [{ api_key: '[redacted]' }] },
      },
      options: request.options.map(({ optionId, name, kind }) => ({ optionId, name, kind })),
      providerPermission: {
        owner: 'provider',
        persistence: 'unverified',
        options: [
          { optionId: 'allow_once', requestedScope: 'once' },
          { optionId: 'allow_session', requestedScope: 'session' },
          { optionId: 'allow_always', requestedScope: 'persistent' },
          { optionId: 'cancel', requestedScope: 'once' },
        ],
      },
    });
    expect(request).toEqual(original);
  });

  it.each([
    { ...codex, id: 'other' },
    { ...codex, package: 'unreviewed-adapter' },
    { ...codex, version: '1.8.0' },
  ])('should not infer scopes from familiar labels or IDs with an unreviewed adapter %j', (adapter) => {
    expect(providerPermissionPayload(request, adapter)).toMatchObject({
      providerPermission: {
        persistence: 'unverified',
        options: request.options.map(({ optionId }) => ({ optionId, requestedScope: 'unspecified' })),
      },
    });
  });

  it('should not classify non-MCP or incompatible Codex choices as persistent', () => {
    expect(providerPermissionPayload({ ...request, _meta: {} }, codex)).toMatchObject({
      providerPermission: {
        options: request.options.map(({ optionId }) => ({ optionId, requestedScope: 'unspecified' })),
      },
    });
    expect(
      providerPermissionPayload(
        {
          ...request,
          options: [{ optionId: 'allow_always', name: 'Always', kind: 'reject_always' }],
        },
        codex,
      ),
    ).toMatchObject({
      providerPermission: { options: [{ optionId: 'allow_always', requestedScope: 'unspecified' }] },
    });
  });
});
