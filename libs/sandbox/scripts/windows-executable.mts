/**
 * Purpose: Check that a built `tau-windows-sandbox.exe` is the executable the Windows desktop package may ship: a
 *   64-bit x64 console program that imports no Visual C++ runtime DLL.
 * Why: The helper runs on every Windows machine Tau installs on, elevated once for setup and as the sandbox account for
 *   every launch. A machine without the Visual C++ Redistributable has no `vcruntime140.dll`, so a helper linked to the
 *   dynamic CRT would fail to start there; the crate links the CRT statically (`.cargo/config.toml`) and this check
 *   proves the build did.
 * Environment: Node.js 24+; no filesystem or network access.
 * Usage: import { windowsExecutableProblem } from './windows-executable.mts'
 * Exit codes: n/a (library module).
 */

/** What a PE image is, as far as the check reads it. */
export type WindowsExecutable = Readonly<{
  /** The DLLs it imports, as the image spells them, from its import and delay-import tables. */
  imports: readonly string[];
}>;

/** A Visual C++ runtime DLL: not part of Windows, installed only by the Visual C++ Redistributable or an app. */
const redistributableRuntime = /^(?:vcruntime\d|msvcp\d|vccorlib\d|concrt\d|ucrtbase|api-ms-win-crt-)/iu;

/** Whether a header field has a single-bit flag set; the PE flags read here are powers of two. */
const hasFlag = (value: number, flag: number): boolean => Math.floor(value / flag) % 2 === 1;

const imageFileMachineAmd64 = 0x86_64;
const imageFileExecutableImage = 0x00_02;
const imageFileDll = 0x20_00;
const peThirtyTwoPlusMagic = 0x02_0b;
const imageSubsystemWindowsCui = 3;

/**
 * Read a PE image's machine, kind, subsystem and imported DLLs.
 *
 * @param image - The executable's bytes.
 * @returns What the image is, or why it is not a 64-bit x64 console executable.
 */
export const readWindowsExecutable = (image: Uint8Array<ArrayBuffer>): WindowsExecutable | string => {
  const view = new DataView(image.buffer, image.byteOffset, image.byteLength);
  const inside = (offset: number, length: number): boolean =>
    Number.isSafeInteger(offset) && offset >= 0 && offset + length <= image.byteLength;
  if (!inside(0, 64) || view.getUint16(0, true) !== 0x5a_4d) {
    return 'not a PE image (no MZ header)';
  }
  const header = view.getUint32(0x3c, true);
  if (!inside(header, 24) || view.getUint32(header, true) !== 0x00_00_45_50) {
    return 'not a PE image (no PE signature)';
  }
  if (view.getUint16(header + 4, true) !== imageFileMachineAmd64) {
    return 'not an x64 image';
  }
  const sectionCount = view.getUint16(header + 6, true);
  const optionalSize = view.getUint16(header + 20, true);
  const characteristics = view.getUint16(header + 22, true);
  if (!hasFlag(characteristics, imageFileExecutableImage) || hasFlag(characteristics, imageFileDll)) {
    return 'not an executable (it is a DLL or an unlinked object)';
  }
  const optional = header + 24;
  if (!inside(optional, 120) || view.getUint16(optional, true) !== peThirtyTwoPlusMagic) {
    return 'not a 64-bit (PE32+) image';
  }
  if (view.getUint16(optional + 68, true) !== imageSubsystemWindowsCui) {
    return 'not a console executable';
  }
  const directoryCount = view.getUint32(optional + 108, true);
  const sections = optional + optionalSize;
  if (!inside(sections, sectionCount * 40)) {
    return 'truncated section table';
  }
  /* An RVA's file offset: the section that maps it, or `undefined` for one no section holds. */
  const offsetOf = (rva: number): number | undefined => {
    for (let index = 0; index < sectionCount; index += 1) {
      const entry = sections + index * 40;
      const virtualSize = view.getUint32(entry + 8, true);
      const virtualAddress = view.getUint32(entry + 12, true);
      const rawSize = view.getUint32(entry + 16, true);
      const rawPointer = view.getUint32(entry + 20, true);
      if (rva >= virtualAddress && rva < virtualAddress + Math.max(virtualSize, rawSize)) {
        return rawPointer + (rva - virtualAddress);
      }
    }
    return undefined;
  };
  const nameAt = (rva: number): string | undefined => {
    const start = offsetOf(rva);
    if (start === undefined || !inside(start, 1)) {
      return undefined;
    }
    const end = image.indexOf(0, start);
    return end === -1 ? undefined : new TextDecoder('latin1').decode(image.subarray(start, end));
  };
  /* Each table is a run of fixed-size descriptors ended by an all-zero one; `nameField` holds the DLL name's RVA. */
  const tableNames = (directory: number, size: number, nameField: number): string[] | string => {
    if (directory >= directoryCount) {
      return [];
    }
    const rva = view.getUint32(optional + 112 + directory * 8, true);
    if (rva === 0) {
      return [];
    }
    const start = offsetOf(rva);
    if (start === undefined) {
      return 'an import table outside every section';
    }
    const names: string[] = [];
    for (let entry = start; ; entry += size) {
      if (!inside(entry, size)) {
        return 'a truncated import table';
      }
      if (image.subarray(entry, entry + size).every((byte) => byte === 0)) {
        return names;
      }
      const name = nameAt(view.getUint32(entry + nameField, true));
      if (name === undefined) {
        return 'an import whose DLL name is unreadable';
      }
      names.push(name);
    }
  };
  const imports = tableNames(1, 20, 12);
  const delayed = tableNames(13, 32, 4);
  for (const table of [imports, delayed]) {
    if (typeof table === 'string') {
      return table;
    }
  }
  return { imports: [...(imports as string[]), ...(delayed as string[])] };
};

/**
 * Why a built helper may not ship, if it may not.
 *
 * @param image - The executable's bytes.
 * @returns The problem, or `undefined` for a 64-bit x64 console executable that imports Windows DLLs only.
 */
export const windowsExecutableProblem = (image: Uint8Array<ArrayBuffer>): string | undefined => {
  const executable = readWindowsExecutable(image);
  if (typeof executable === 'string') {
    return executable;
  }
  if (executable.imports.length === 0) {
    return 'an executable that imports nothing, which no linked Rust program is';
  }
  const runtime = executable.imports.filter((name) => redistributableRuntime.test(name));
  return runtime.length === 0
    ? undefined
    : `linked to the Visual C++ runtime (${runtime.join(', ')}), which Windows does not ship; build it with the static CRT`;
};
