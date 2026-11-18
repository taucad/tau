#!/usr/bin/env node

/**
 * Purpose: Check the Windows helper's ship gate (`windows-executable.mts`) against synthetic PE images.
 * Why: The gate is the only thing that proves, before packaging, that the helper starts on a Windows machine without the
 *   Visual C++ Redistributable; it must accept a static-CRT x64 console build and refuse everything else.
 * Environment: Node.js 24+; no filesystem or network access.
 * Usage: node --import @oxc-node/core/register --test libs/sandbox/scripts/windows-executable.test.mts
 * Exit codes: 0 when every check passes; non-zero on regression.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

// oxlint-disable-next-line no-restricted-imports -- Operational scripts are outside the library's # source alias.
import { readWindowsExecutable, windowsExecutableProblem } from './windows-executable.mjs';

type ImageOptions = Readonly<{
  machine?: number;
  characteristics?: number;
  magic?: number;
  subsystem?: number;
  imports?: readonly string[];
  delayImports?: readonly string[];
}>;

/**
 * A minimal PE32+ image: DOS header, PE header, optional header with 16 data directories, and one section holding the
 * import and delay-import tables with their DLL names.
 */
const peImage = (options: ImageOptions = {}): Uint8Array<ArrayBuffer> => {
  const imports = options.imports ?? ['KERNEL32.dll', 'ADVAPI32.dll'];
  const delayImports = options.delayImports ?? [];
  const header = 0x80;
  const optional = header + 24;
  const optionalSize = 240;
  const sectionTable = optional + optionalSize;
  const sectionRaw = 0x02_00;
  const sectionRva = 0x10_00;
  const image = new Uint8Array(0x08_00);
  const view = new DataView(image.buffer);
  view.setUint16(0, 0x5a_4d, true);
  view.setUint32(0x3c, header, true);
  view.setUint32(header, 0x00_00_45_50, true);
  view.setUint16(header + 4, options.machine ?? 0x86_64, true);
  view.setUint16(header + 6, 1, true);
  view.setUint16(header + 20, optionalSize, true);
  view.setUint16(header + 22, options.characteristics ?? 0x00_22, true);
  view.setUint16(optional, options.magic ?? 0x02_0b, true);
  view.setUint16(optional + 68, options.subsystem ?? 3, true);
  view.setUint32(optional + 108, 16, true);
  /* The section: imports at its start, delay imports after, names after both. */
  view.setUint32(sectionTable + 8, 0x06_00, true);
  view.setUint32(sectionTable + 12, sectionRva, true);
  view.setUint32(sectionTable + 16, 0x06_00, true);
  view.setUint32(sectionTable + 20, sectionRaw, true);
  const importTable = 0;
  const delayTable = (imports.length + 1) * 20;
  let names = delayTable + (delayImports.length + 1) * 32;
  const writeName = (name: string): number => {
    const at = names;
    image.set(new TextEncoder().encode(name), sectionRaw + at);
    names += name.length + 1;
    return sectionRva + at;
  };
  for (const [index, name] of imports.entries()) {
    view.setUint32(sectionRaw + importTable + index * 20 + 12, writeName(name), true);
  }
  for (const [index, name] of delayImports.entries()) {
    view.setUint32(sectionRaw + delayTable + index * 32 + 4, writeName(name), true);
  }
  if (imports.length > 0) {
    view.setUint32(optional + 112 + 8, sectionRva + importTable, true);
  }
  if (delayImports.length > 0) {
    view.setUint32(optional + 112 + 13 * 8, sectionRva + delayTable, true);
  }
  return image;
};

await test('accepts an x64 console executable that imports Windows DLLs only, msvcrt.dll included', () => {
  const image = peImage({
    imports: ['KERNEL32.dll', 'ADVAPI32.dll', 'msvcrt.dll'],
    delayImports: ['USER32.dll'],
  });
  assert.deepEqual(readWindowsExecutable(image), {
    imports: ['KERNEL32.dll', 'ADVAPI32.dll', 'msvcrt.dll', 'USER32.dll'],
  });
  assert.equal(windowsExecutableProblem(image), undefined);
});

await test('refuses a helper linked to the dynamic Visual C++ runtime, from either import table', () => {
  assert.equal(
    windowsExecutableProblem(
      peImage({
        imports: ['KERNEL32.dll', 'VCRUNTIME140.dll', 'api-ms-win-crt-runtime-l1-1-0.dll'],
      }),
    ),
    'linked to the Visual C++ runtime (VCRUNTIME140.dll, api-ms-win-crt-runtime-l1-1-0.dll), which Windows does not ship; build it with the static CRT',
  );
  assert.match(
    windowsExecutableProblem(peImage({ delayImports: ['ucrtbase.dll'] })) ?? '',
    /Visual C\+\+ runtime \(ucrtbase\.dll\)/u,
  );
  assert.match(windowsExecutableProblem(peImage({ imports: ['MSVCP140.dll'] })) ?? '', /MSVCP140\.dll/u);
});

await test('refuses anything that is not a 64-bit x64 console executable', () => {
  assert.equal(windowsExecutableProblem(new Uint8Array(16)), 'not a PE image (no MZ header)');
  const elf = new Uint8Array(128);
  elf.set([0x7f, 0x45, 0x4c, 0x46]);
  assert.equal(windowsExecutableProblem(elf), 'not a PE image (no MZ header)');
  const noSignature = peImage();
  noSignature[0x80] = 0;
  assert.equal(windowsExecutableProblem(noSignature), 'not a PE image (no PE signature)');
  assert.equal(windowsExecutableProblem(peImage({ machine: 0x01_4c })), 'not an x64 image');
  assert.equal(windowsExecutableProblem(peImage({ machine: 0xaa_64 })), 'not an x64 image');
  assert.equal(
    windowsExecutableProblem(peImage({ characteristics: 0x20_22 })),
    'not an executable (it is a DLL or an unlinked object)',
  );
  assert.equal(windowsExecutableProblem(peImage({ magic: 0x01_0b })), 'not a 64-bit (PE32+) image');
  assert.equal(windowsExecutableProblem(peImage({ subsystem: 2 })), 'not a console executable');
  assert.equal(
    windowsExecutableProblem(peImage({ imports: [] })),
    'an executable that imports nothing, which no linked Rust program is',
  );
});

await test('refuses a damaged import table rather than reading past it', () => {
  const truncated = peImage().subarray(0, 0x02_10);
  assert.equal(windowsExecutableProblem(truncated), 'a truncated import table');
  const unmapped = peImage();
  new DataView(unmapped.buffer).setUint32(0x98 + 112 + 8, 0x90_00, true);
  assert.equal(windowsExecutableProblem(unmapped), 'an import table outside every section');
});
