import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requestRefRemoval } from '#routes/w.$workspace.$project/revision-ref-removal.js';

vi.mock('#environment.config.js', () => ({
  requireClientEnvironmentUrl: () => 'https://api.tau.test',
}));

const line = 'refs/heads/conflicts/main/device-b';
const answer = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status });

describe('requestRefRemoval (D24)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should ask the audited verb to remove the conflict line, and nothing else', async () => {
    vi.mocked(fetch).mockResolvedValue(answer(200, { ref: line, tip: '0'.repeat(40) }));

    await expect(requestRefRemoval('proj_1', line)).resolves.toStrictEqual({ kind: 'removed' });
    const [url, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(url).toBe(`https://api.tau.test/v1/git/proj_1/refs?name=${encodeURIComponent(line)}`);
    expect(init).toMatchObject({ method: 'DELETE', credentials: 'include' });
  });

  it('should take a line the remote no longer holds as removed', async () => {
    vi.mocked(fetch).mockResolvedValue(answer(404, { code: 'GIT_REF_NOT_FOUND' }));

    await expect(requestRefRemoval('proj_1', line)).resolves.toStrictEqual({ kind: 'removed' });
  });

  it('should pass a refusal on with its code', async () => {
    vi.mocked(fetch).mockResolvedValue(answer(403, { code: 'GIT_REF_REMOVAL_OWNER_ONLY' }));

    await expect(requestRefRemoval('proj_1', line)).resolves.toStrictEqual({
      kind: 'refused',
      code: 'GIT_REF_REMOVAL_OWNER_ONLY',
    });
  });

  it('should take only a conflict line, never a version tag (F2, rule 14)', () => {
    // @ts-expect-error -- a version is never removed, so its tag is not a removable ref.
    const removing = async (): Promise<unknown> => requestRefRemoval('proj_1', 'refs/tags/v4');

    expect(removing).toBeTypeOf('function');
  });
});
