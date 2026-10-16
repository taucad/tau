import { describe, expect, it } from 'vitest';
import { externalAgentDescriptorSchema } from '#wire/index.js';

const permission = {
  type: 'select',
  id: 'permissions',
  name: 'Permissions',
  category: 'mode',
  currentValue: 'ask',
  options: [
    { value: 'ask', name: 'Ask' },
    { value: 'always-approve', name: 'Always approve' },
  ],
};
const descriptor = { id: 'grok', displayName: 'Grok Build', models: [] };

describe('discovered external agent controls', () => {
  it('should carry verified select and boolean controls without requiring them on older hosts', () => {
    const value = {
      ...descriptor,
      configOptions: [permission, { type: 'boolean', id: 'search', name: 'Search', currentValue: false }],
    };
    expect(externalAgentDescriptorSchema.parse(value)).toEqual(value);
    expect(externalAgentDescriptorSchema.parse(descriptor)).toEqual(descriptor);
  });
  it('should reject oversized or malformed discovered controls at the host boundary', () => {
    expect(
      externalAgentDescriptorSchema.safeParse({
        ...descriptor,
        configOptions: Array.from({ length: 33 }, () => permission),
      }).success,
    ).toBe(false);
    expect(
      externalAgentDescriptorSchema.safeParse({ ...descriptor, configOptions: [{ ...permission, currentValue: true }] })
        .success,
    ).toBe(false);
    expect(
      externalAgentDescriptorSchema.safeParse({
        ...descriptor,
        configOptions: [{ ...permission, name: 'x'.repeat(129) }],
      }).success,
    ).toBe(false);
  });
});

it('should preserve admitted host identity through the external-agent wire schema', async () => {
  const { agentChannelRunKindSchema } = await import('#wire/admission.schema.js');
  expect(
    agentChannelRunKindSchema.parse({
      kind: 'acp',
      id: 'grok',
      hostId: 'desktop',
      config: { 'tau.grok.permissions': 'ask' },
    }),
  ).toEqual({
    kind: 'acp',
    id: 'grok',
    hostId: 'desktop',
    config: { 'tau.grok.permissions': 'ask' },
  });
});
