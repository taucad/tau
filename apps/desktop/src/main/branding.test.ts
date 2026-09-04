import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const resources = new URL('../../resources/', import.meta.url);

describe('desktop branding', () => {
  it('ships the Tau identity and native icon formats', () => {
    const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as Record<
      string,
      unknown
    >;
    const png = readFileSync(new URL('icon.png', resources));
    const darkPng = readFileSync(new URL('icon-dark.png', resources));
    const icns = readFileSync(new URL('icon.icns', resources));
    const ico = readFileSync(new URL('icon.ico', resources));

    expect(manifest).toMatchObject({ productName: 'Tau', desktopName: 'com.taucad.tau.desktop' });
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect([png.readUInt32BE(16), png.readUInt32BE(20), png[25]]).toEqual([1024, 1024, 6]);
    expect([darkPng.readUInt32BE(16), darkPng.readUInt32BE(20), darkPng[25]]).toEqual([1024, 1024, 6]);
    expect(icns.subarray(0, 4).toString()).toBe('icns');
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(6);
  });
});
