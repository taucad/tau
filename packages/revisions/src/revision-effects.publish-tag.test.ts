import { describe, expect, it, vi } from 'vitest';
import { revisionId } from '#algorithms/index.js';
import type { CreateRevisionTagInput, RevisionTag } from '#revision-port.js';
import { writePublishTag } from '#revision-effects.js';

/* V2 on rev-1, renamed since the publish dialog read it as "Ready for print". */
const renamed: RevisionTag = {
  id: '2'.repeat(32),
  number: 2,
  name: 'Final',
  revisionId: revisionId('rev-1'),
  note: undefined,
  actor: undefined,
  createdAt: 1,
};

const fakePort = (): {
  readonly port: Parameters<typeof writePublishTag>[0];
  readonly tag: ReturnType<typeof vi.fn<(input: CreateRevisionTagInput) => Promise<RevisionTag>>>;
} => {
  const tag = vi.fn<(input: CreateRevisionTagInput) => Promise<RevisionTag>>(async (input) => ({
    ...renamed,
    name: input.name,
    number: input.number ?? 3,
    note: input.note,
  }));
  return { port: { listTags: async () => [renamed], tag }, tag };
};

describe('writePublishTag', () => {
  it('publishes a version as it is under the name it has now, writing nothing', async () => {
    const { port, tag } = fakePort();

    const written = await writePublishTag(port, { revisionId: 'rev-1', number: 2 }, undefined);

    expect(written).toStrictEqual(renamed);
    expect(tag).not.toHaveBeenCalled();
  });

  it('keeps the name it has now when a note changes the version', async () => {
    const { port, tag } = fakePort();

    await writePublishTag(port, { revisionId: 'rev-1', number: 2, note: 'for print' }, undefined);

    expect(tag).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ name: 'Final', number: 2, note: 'for print' }),
    );
  });

  it('names a new version as asked', async () => {
    const { port, tag } = fakePort();

    await writePublishTag(port, { name: 'Shared Nov 19', revisionId: 'rev-2' }, undefined);

    expect(tag).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ name: 'Shared Nov 19', revisionId: 'rev-2' }),
    );
  });

  it('refuses a version that is no longer on this device', async () => {
    const { port } = fakePort();

    await expect(writePublishTag(port, { revisionId: 'rev-1', number: 7 }, undefined)).rejects.toThrow(
      'V7 is no longer on this device. Publish again to pick a version.',
    );
  });
});
