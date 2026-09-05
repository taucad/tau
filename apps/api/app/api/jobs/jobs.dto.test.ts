import { describe, expect, it } from 'vitest';
import {
  jobDefinitionSchema,
  submitJobSchema,
  workerActionPublishSchema,
  workerActionReadSchema,
} from '#api/jobs/jobs.dto.js';

const digest = `sha256:${'0'.repeat(64)}`;

const definition = () => ({
  type: 'openfoam.cfd',
  version: '2506',
  input: { digest, size: 42, mediaType: 'application/vnd.tau.revision', storageKey: 'revisions/input' },
  requirements: [
    { key: 'container', condition: 'equals', value: true },
    { key: 'memory', condition: 'at-least', value: 8 },
  ],
  slotCost: 4,
  maxAttempts: 2,
  options: { case: 'naca' },
  outputs: [{ role: 'report', logicalPath: 'reports/result.html', mediaType: 'text/html' }],
});

describe('job DTO schemas', () => {
  it('accepts one immutable, capability-routed submission', () => {
    expect(
      submitJobSchema.parse({
        projectId: 'project-1',
        idempotencyKey: 'request-1',
        definitionDigest: digest,
        definition: definition(),
      }),
    ).toMatchObject({ projectId: 'project-1', definition: { type: 'openfoam.cfd', slotCost: 4 } });
  });

  it('rejects path escape, duplicate requirements, and non-JSON options', () => {
    const invalid = definition();
    invalid.outputs[0] = { ...invalid.outputs[0]!, logicalPath: '../outside' };
    invalid.requirements.push({ key: 'memory', condition: 'at-least', value: 16 });
    expect(jobDefinitionSchema.safeParse(invalid).success).toBe(false);
    expect(jobDefinitionSchema.safeParse({ ...definition(), options: { invalid: Number.NaN } }).success).toBe(false);
  });

  it('accepts strict versioned action records and rejects malformed dependencies', () => {
    const actionDigest = `sha256:${'a'.repeat(64)}`;
    const body = {
      jobId: 'job-1',
      attemptId: 'attempt-1',
      attempt: 1,
      record: {
        schemaVersion: 1,
        actionDigest,
        codec: { id: 'openfoam-stage', version: '1' },
        output: { digest, size: 42, mediaType: 'application/octet-stream' },
        dependencies: [],
      },
    };
    expect(workerActionPublishSchema.parse(body)).toEqual(body);
    expect(
      workerActionReadSchema.parse({
        jobId: body.jobId,
        attemptId: body.attemptId,
        attempt: body.attempt,
        actionDigest,
      }),
    ).toBeDefined();
    expect(
      workerActionPublishSchema.safeParse({
        ...body,
        record: { ...body.record, dependencies: [digest, digest] },
      }).success,
    ).toBe(false);
    expect(workerActionPublishSchema.safeParse({ ...body, record: { ...body.record, schemaVersion: 2 } }).success).toBe(
      false,
    );
  });
});
