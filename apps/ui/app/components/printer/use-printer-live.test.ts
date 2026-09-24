import { describe, expect, it } from 'vitest';
import { selectPrinterLive } from '#components/printer/use-printer-live.js';
import { entry, manifest, printing } from '#routes/w.$workspace.$project/chat-print.fixture.js';

describe('selectPrinterLive', () => {
  it('draws the followed machine with its own provider manifest', () => {
    const live = selectPrinterLive([entry({ machineId: 'idle-1' }), printing()], new Map([['bambu', manifest]]));

    expect(live?.isActive).toBe(true);
    expect(live?.manifest).toBe(manifest);
  });

  it('leaves the manifest unset until the providers load, or when the provider published none', () => {
    expect(selectPrinterLive([printing()])?.manifest).toBeUndefined();
    expect(selectPrinterLive([printing()], new Map([['other-provider', manifest]]))?.manifest).toBeUndefined();
  });

  it('follows no machine that is stale or disconnected', () => {
    expect(selectPrinterLive([entry({ freshness: 'stale' })], new Map([['bambu', manifest]]))).toBeUndefined();
  });
});
