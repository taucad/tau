import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRevisionRefRemoval } from '#lib/revision-ref-removal.js';

const { requestRefRemoval } = createRevisionRefRemoval({ apiBaseUrl: () => 'https://api.tau.test' });

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

  it('should read the API origin on every request and drop its trailing slash', async () => {
    const origins = ['https://one.tau.test/', 'https://two.tau.test'];
    const removal = createRevisionRefRemoval({ apiBaseUrl: () => origins.shift() ?? '' });
    vi.mocked(fetch).mockImplementation(async () => answer(200, {}));

    await removal.requestRefRemoval('proj_1', line);
    await removal.requestRefRemoval('proj_1', line);

    const urls = vi.mocked(fetch).mock.calls.map(([url]) => url);
    expect(urls).toStrictEqual([
      `https://one.tau.test/v1/git/proj_1/refs?name=${encodeURIComponent(line)}`,
      `https://two.tau.test/v1/git/proj_1/refs?name=${encodeURIComponent(line)}`,
    ]);
  });

  it('should reject without a request when the API origin is not configured', async () => {
    const removal = createRevisionRefRemoval({
      apiBaseUrl: () => {
        throw new Error('TAU_API_URL is not configured');
      },
    });

    await expect(removal.requestRefRemoval('proj_1', line)).rejects.toThrow('TAU_API_URL is not configured');
    expect(fetch).not.toHaveBeenCalled();
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
