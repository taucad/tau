import { beforeEach, expect, it, vi } from 'vitest';

const configureMonaco = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('#lib/monaco.lib.client.js', () => ({ configureMonaco }));

beforeEach(() => {
  vi.resetModules();
  configureMonaco.mockReset();
});

it('configures Monaco once however often intent repeats', async () => {
  configureMonaco.mockResolvedValue(undefined);
  const { warmMonaco } = await import('#lib/monaco-warmup.js');

  warmMonaco();
  warmMonaco();
  warmMonaco();

  await vi.waitFor(() => {
    expect(configureMonaco).toHaveBeenCalledTimes(1);
  });
});

it('allows a later attempt after a failed one', async () => {
  configureMonaco.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
  const { warmMonaco } = await import('#lib/monaco-warmup.js');

  warmMonaco();
  await vi.waitFor(() => {
    expect(configureMonaco).toHaveBeenCalledTimes(1);
  });
  await Promise.resolve();

  warmMonaco();
  await vi.waitFor(() => {
    expect(configureMonaco).toHaveBeenCalledTimes(2);
  });
});
