/* eslint-disable @typescript-eslint/naming-convention -- provider wire and credential keys retain their original spellings. */
import { describe, expect, it } from 'vitest';
import type { RequestPermissionRequest } from '@agentclientprotocol/sdk';
import {
  providerPermissionPayload,
  redactPermissionMetadata,
  supportsPermissionReadback,
  permissionReadbackCapability,
  permissionObservationOf,
} from '#acp/provider-permission.js';

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

it('should report unsupported persistence only for a reviewed provider request', () => {
  const unsupported = {
    ...request,
    toolCall: {
      ...request.toolCall,
      _meta: {
        'tau/permissionPersistence': { version: 1, support: 'unsupported', reason: 'unconfigured-mcp-server' },
      },
    },
  };
  expect(providerPermissionPayload(unsupported, codex, { negotiated: true })).toMatchObject({
    providerPermission: { readback: 'unsupported', unsupportedReason: 'unconfigured-mcp-server' },
  });
  expect(providerPermissionPayload(unsupported, { ...codex, id: 'other' }, { negotiated: true })).not.toMatchObject({
    providerPermission: { readback: 'unsupported' },
  });
  expect(providerPermissionPayload(unsupported, codex, { negotiated: false })).not.toMatchObject({
    providerPermission: { readback: 'unsupported' },
  });
});

it('should require an exact reviewed connection and negotiated readback version', () => {
  expect(supportsPermissionReadback(codex, permissionReadbackCapability)).toBe(true);
  expect(supportsPermissionReadback({ ...codex, version: '1.8.0' }, permissionReadbackCapability)).toBe(false);
  expect(supportsPermissionReadback(codex, undefined)).toBe(false);
  expect(supportsPermissionReadback(codex, { ...permissionReadbackCapability, version: 2 })).toBe(false);
  expect(supportsPermissionReadback(codex, { ...permissionReadbackCapability, families: [] })).toBe(false);
});

it('should reject opaque fields and incompatible status values in provider observations', () => {
  const observation = {
    version: 1,
    provider: 'codex',
    optionId: 'allow_always',
    toolCallId: 'call',
    requestedScope: 'persistent',
    stored: 'present',
    effective: 'allowed',
    preexisting: false,
    observation: 'config-readback',
    reason: 'policy-observed',
  };
  expect(permissionObservationOf({ ...observation, rawConfig: { credential: 'never-log' } })).toBeUndefined();
  expect(permissionObservationOf({ ...observation, stored: 'verified' })).toBeUndefined();
  expect(permissionObservationOf({ ...observation, optionId: 'allow_once' })).toBeUndefined();
});

it('should classify Grok persistence only when the host prepared exact native readback', () => {
  const grokRequest: RequestPermissionRequest = {
    ...request,
    options: [
      { optionId: 'always-allow', name: 'Always', kind: 'allow_always' },
      { optionId: 'allow-once', name: 'Once', kind: 'allow_once' },
      { optionId: 'reject-once', name: 'Reject', kind: 'reject_once' },
    ],
  };
  expect(providerPermissionPayload(grokRequest, { id: 'grok' }, { localPrepared: true })).toMatchObject({
    providerPermission: {
      readback: 'permission-file',
      options: [
        { optionId: 'always-allow', requestedScope: 'persistent' },
        { optionId: 'allow-once', requestedScope: 'once' },
        { optionId: 'reject-once', requestedScope: 'once' },
      ],
    },
  });
  expect(providerPermissionPayload(grokRequest, { id: 'grok' })).toMatchObject({
    providerPermission: {
      options: grokRequest.options.map(({ optionId }) => ({ optionId, requestedScope: 'unspecified' })),
    },
  });
});

it('should redact credential header pairs without hiding ordinary headers', () => {
  expect(
    redactPermissionMetadata({
      headers: [
        { name: 'Authorization', value: 'Bearer secret-value' },
        { name: 'X-Api-Key', value: 'key-value' },
        { name: 'Cookie', value: 'session=secret' },
        { name: 'Accept', value: 'application/json' },
      ],
    }),
  ).toEqual({
    headers: [
      { name: 'Authorization', value: '[redacted]' },
      { name: 'X-Api-Key', value: '[redacted]' },
      { name: 'Cookie', value: '[redacted]' },
      { name: 'Accept', value: 'application/json' },
    ],
  });
});

it('should name the exact command scope only for qualified Grok shell choices', () => {
  const shell: RequestPermissionRequest = {
    sessionId: 'session',
    toolCall: {
      toolCallId: 'shell',
      kind: 'execute',
      rawInput: { variant: 'Bash', command: 'python3 -c "print(42)"', is_background: false },
    },
    options: [{ optionId: 'always-allow', kind: 'allow_always', name: "Yes, and don't ask again for bash commands" }],
  };
  expect(providerPermissionPayload(shell, { id: 'grok' }, { localPrepared: true })).toMatchObject({
    options: [{ optionId: 'always-allow', kind: 'allow_always', name: 'Allow this command in future' }],
  });
  expect(providerPermissionPayload(shell, { id: 'grok' })).toMatchObject({ options: shell.options });
  expect(providerPermissionPayload(shell, { id: 'other' }, { localPrepared: true })).toMatchObject({
    options: shell.options,
  });
});
