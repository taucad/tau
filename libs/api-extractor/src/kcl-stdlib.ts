import kclStdlibRaw from '#generated/kcl/kcl-stdlib-export.json?raw';
import type { KclStdlibExport } from '#languages/kcl/extract.js';

/** The vendored KCL standard library export, for editors that show its declarations read-only. @public */
export const kclStdlibExport = JSON.parse(kclStdlibRaw) as KclStdlibExport;
