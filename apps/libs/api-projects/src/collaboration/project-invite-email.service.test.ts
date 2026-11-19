import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { ConfigService } from '@nestjs/config';
import type { Environment } from '@taucad/api-core';
import * as schema from '@taucad/api-database/schema';
import type { EmailDeliverabilityService, EmailService } from '@taucad/api-email';
import type { MetricsService } from '@taucad/api-observability/metrics';
import { ProjectInviteEmailService } from '#collaboration/project-invite-email.service.js';
import type { ProjectInviteEmailInput } from '#collaboration/project-invite-email.service.js';
import { createTableDatabase } from '#testing/table-database.fixture.js';

const invitation: ProjectInviteEmailInput = {
  projectId: 'proj_x',
  ownerId: 'user_owner',
  email: 'Friend@Example.com',
  role: 'write',
  token: 'tok_secret-value',
  expiresAt: '2026-12-03T10:00:00.000Z',
};

function createService(
  overrides: {
    readonly deliveryEnabled?: boolean;
    readonly send?: EmailService['sendProjectInvite'];
    readonly undeliverable?: readonly string[];
    readonly deliverabilityFails?: boolean;
  } = {},
): {
  readonly service: ProjectInviteEmailService;
  readonly sendProjectInvite: ReturnType<typeof vi.fn>;
  readonly outcomes: ReturnType<typeof vi.fn>;
} {
  const database = createTableDatabase([
    [schema.user, [{ id: 'user_owner', name: 'Ada' }]],
    [schema.project, [{ id: 'proj_x', ownerId: 'user_owner', name: 'Bracket' }]],
  ]);
  const sent: EmailService['sendProjectInvite'] = async () => 'sent';
  const sendProjectInvite = vi.fn(overrides.send ?? sent);
  const emailService = mock<EmailService>({ isDeliveryEnabled: overrides.deliveryEnabled ?? true, sendProjectInvite });
  const outcomes = vi.fn();
  const metrics = mock<MetricsService>({ projectInviteEmailsTotal: { add: outcomes } });
  const config = mock<ConfigService<Environment, true>>({
    get: vi.fn((key: string) => (key === 'TAU_FRONTEND_URL' ? 'https://tau.new' : '')),
  });
  const deliverability = mock<EmailDeliverabilityService>({
    undeliverableAmong: vi.fn(async () => {
      if (overrides.deliverabilityFails === true) {
        throw new Error('Failed query: select … where email = any($1) params: friend@example.com');
      }
      return new Set(overrides.undeliverable ?? []);
    }),
  });
  const service = new ProjectInviteEmailService(
    database.databaseService as ConstructorParameters<typeof ProjectInviteEmailService>[0],
    emailService,
    config,
    metrics,
    deliverability,
  );
  return { service, sendProjectInvite, outcomes };
}

describe('ProjectInviteEmailService', () => {
  it('emails the invitation link, the role and the expiry, and counts it sent', async () => {
    const { service, sendProjectInvite, outcomes } = createService();

    await expect(service.send(invitation)).resolves.toStrictEqual({ status: 'sent' });

    expect(sendProjectInvite).toHaveBeenCalledExactlyOnceWith({
      recipientEmail: 'Friend@Example.com',
      ownerName: 'Ada',
      projectName: 'Bracket',
      role: 'write',
      expiresAt: '3 Dec 2026',
      url: 'https://tau.new/invitations/tok_secret-value',
    });
    expect(outcomes).toHaveBeenCalledExactlyOnceWith(1, { outcome: 'sent' });
  });

  it('skips a suppressed address without calling the provider', async () => {
    const { service, sendProjectInvite, outcomes } = createService({ undeliverable: ['friend@example.com'] });

    await expect(service.send(invitation)).resolves.toStrictEqual({ status: 'skipped', reason: 'undeliverable' });
    expect(sendProjectInvite).not.toHaveBeenCalled();
    expect(outcomes).toHaveBeenCalledExactlyOnceWith(1, { outcome: 'undeliverable' });
  });

  it('treats a failed suppression lookup as deliverable, without logging the address the query carried', async () => {
    const { service } = createService({ deliverabilityFails: true });
    const warn = vi.spyOn(Reflect.get(service, 'logger') as { warn: (message: string) => void }, 'warn');

    await expect(service.send(invitation)).resolves.toStrictEqual({ status: 'sent' });
    const logged = warn.mock.calls.map(([message]) => message).join('\n');
    expect(logged).toContain('Email deliverability lookup failed');
    expect(logged.toLowerCase()).not.toContain('friend@example.com');
  });

  it('reports email_disabled on a deployment without an email provider', async () => {
    const { service, sendProjectInvite } = createService({ deliveryEnabled: false });

    await expect(service.send(invitation)).resolves.toStrictEqual({ status: 'skipped', reason: 'email_disabled' });
    expect(sendProjectInvite).not.toHaveBeenCalled();
  });

  it('reports email_disabled when the send itself finds no provider', async () => {
    const { service } = createService({ send: async () => 'disabled' });

    await expect(service.send(invitation)).resolves.toStrictEqual({ status: 'skipped', reason: 'email_disabled' });
  });

  it('reports send_failed and never logs the token when the provider refuses', async () => {
    const { service, outcomes } = createService({
      send: async () => {
        throw new Error('Failed to send project-invite email');
      },
    });
    const warn = vi.spyOn(Reflect.get(service, 'logger') as { warn: (message: string) => void }, 'warn');

    await expect(service.send(invitation)).resolves.toStrictEqual({ status: 'skipped', reason: 'send_failed' });
    expect(outcomes).toHaveBeenCalledExactlyOnceWith(1, { outcome: 'send_failed' });
    const logged = warn.mock.calls.map(([message]) => message).join('\n');
    expect(logged).not.toContain('tok_secret-value');
    expect(logged).not.toContain('Friend@Example.com');
  });
});
