import { describe, expect, it } from 'vitest';
import { deploymentAnswerPath, deploymentAnswerSchema, parseDeploymentAnswer } from '#deployment.js';

const cloud = { version: 1, edition: 'cloud', billing: { funded: true, environment: 'staging' }, maxAgeSeconds: 300 };
const selfHost = { version: 1, edition: 'self-host', billing: { funded: false }, maxAgeSeconds: 300 };

describe('parseDeploymentAnswer', () => {
  it('should read a funded Cloud answer as valid', () => {
    expect(parseDeploymentAnswer(cloud)).toEqual({ status: 'valid', answer: cloud });
  });

  it('should read a self-host answer as valid and unfunded', () => {
    expect(parseDeploymentAnswer(selfHost)).toEqual({ status: 'valid', answer: selfHost });
  });

  it('should read an unfunded Cloud answer as valid', () => {
    const answer = { ...cloud, billing: { funded: false } };
    expect(parseDeploymentAnswer(answer)).toEqual({ status: 'valid', answer });
  });

  it('should drop fields it does not know, so an additive API change keeps older hosts working', () => {
    expect(parseDeploymentAnswer({ ...cloud, region: 'us', billing: { ...cloud.billing, currency: 'usd' } })).toEqual({
      status: 'valid',
      answer: cloud,
    });
  });

  it.each([
    ['a non-object body', 'not json', 'answer'],
    ['null', null, 'answer'],
    ['an empty object', {}, 'version'],
    ['another version', { ...cloud, version: 2 }, 'version'],
    ['an unknown edition', { ...cloud, edition: 'enterprise' }, 'edition'],
    ['a missing funded flag', { ...cloud, billing: {} }, 'billing.funded'],
    ['a string funded flag', { ...cloud, billing: { funded: 'true' } }, 'billing.funded'],
    ['a self-host answer that claims funding', { ...selfHost, billing: { funded: true } }, 'billing.funded'],
    [
      'an unfunded answer that names an environment',
      { ...selfHost, billing: { funded: false, environment: 'staging' } },
      'billing.environment',
    ],
    ['an empty environment', { ...cloud, billing: { funded: true, environment: '' } }, 'billing.environment'],
    ['a negative max age', { ...cloud, maxAgeSeconds: -1 }, 'maxAgeSeconds'],
    ['a fractional max age', { ...cloud, maxAgeSeconds: 1.5 }, 'maxAgeSeconds'],
  ])('should read %s as malformed, naming the field', (_case, body, field) => {
    const result = parseDeploymentAnswer(body);
    expect(result.status).toBe('malformed');
    expect(result.status === 'malformed' && result.reason.startsWith(`${field}:`)).toBe(true);
  });

  it('should never echo the body in a malformed reason', () => {
    const result = parseDeploymentAnswer({ ...cloud, edition: 'secret-looking-value' });
    expect(result.status === 'malformed' && result.reason.includes('secret-looking-value')).toBe(false);
  });
});

describe('deploymentAnswerSchema', () => {
  it('should publish the route beside its schema', () => {
    expect(deploymentAnswerPath).toBe('/v1/deployment');
    expect(deploymentAnswerSchema.safeParse(cloud).success).toBe(true);
  });
});
