/** A USDZ conversion that cannot run in this host. */
export class UsdzTranscodeError extends Error {}

/** Mobile AR is unavailable in Electron; keep its Assimp worker out of the renderer build. */
export async function transcodeGlbToUsdz(_glb: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  throw new UsdzTranscodeError('AR Quick Look conversion is unavailable in the desktop app.');
}
