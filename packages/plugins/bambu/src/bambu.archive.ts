import { createHash } from "node:crypto";

import type { MachineArtifactReference, MachineConnectionRuntime } from "@taucad/runtime/machine";
import { unzipSync } from "fflate";

const maximumArchiveBytes = 256 * 1024 * 1024;
const maximumEntries = 512;
const maximumExpandedBytes = 512 * 1024 * 1024;
const maximumPlateBytes = 128 * 1024 * 1024;
const plateMember = "Metadata/plate_1.gcode";
const parser = Object.freeze({ id: "tau.bambu.gcode-3mf", version: "1" } as const);

/** A verified immutable Bambu container retained only for the following transfer. @internal */
export type BambuPreparedArtifact = Readonly<{
  bytes: Uint8Array<ArrayBuffer>;
  digest: MachineArtifactReference["digest"];
  length: number;
  parser: Readonly<{ id: "tau.bambu.gcode-3mf"; version: "1" }>;
  memberMd5: string;
}>;

const fail = (code: string): never => {
  throw new TypeError(code);
};

const safeMemberName = (name: string): string => {
  const directory = name.endsWith("/");
  const path = directory ? name.slice(0, -1) : name;
  if (
    path.length === 0 ||
    name.length > 512 ||
    !name.isWellFormed() ||
    name.includes("\\") ||
    name.startsWith("/") ||
    path.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    return fail("BAMBU_ARCHIVE_MEMBER_INVALID");
  }
  return `${path.normalize("NFC")}${directory ? "/" : ""}`;
};

/** Read and preflight one bounded immutable `.gcode.3mf` without inflating unrelated members.
 * @param input - Qualified artifact, host reader and cancellation.
 * @returns Verified bytes and digest for the immediately following transfer.
 */
export const prepareBambuArtifact = async (input: Readonly<{
  artifact: MachineArtifactReference;
  runtime: Pick<MachineConnectionRuntime, "readArtifact">;
  signal: AbortSignal;
}>): Promise<BambuPreparedArtifact> => {
  const { artifact } = input;
  if (
    artifact.mediaType !== "application/vnd.bambulab.gcode-3mf" ||
    artifact.contract.id !== "manufacturing.toolpath.bambu-gcode-3mf" ||
    artifact.contract.version !== 1 ||
    artifact.selectedMember !== plateMember ||
    !artifact.path.toLowerCase().endsWith(".gcode.3mf") ||
    artifact.length === 0 ||
    artifact.length > maximumArchiveBytes
  ) {
    return fail("BAMBU_ARTIFACT_INCOMPATIBLE");
  }
  const chunks: Array<Uint8Array<ArrayBuffer>> = [];
  let length = 0;
  for await (const chunk of input.runtime.readArtifact({
    artifact,
    maximumBytes: maximumArchiveBytes,
    signal: input.signal,
  })) {
    input.signal.throwIfAborted();
    length += chunk.byteLength;
    if (length > artifact.length || length > maximumArchiveBytes) {
      return fail("BAMBU_ARTIFACT_LENGTH_MISMATCH");
    }
    chunks.push(Uint8Array.from(chunk));
  }
  if (length !== artifact.length) {
    return fail("BAMBU_ARTIFACT_LENGTH_MISMATCH");
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}` as MachineArtifactReference["digest"];
  if (digest !== artifact.digest) {
    return fail("BAMBU_ARTIFACT_DIGEST_MISMATCH");
  }
  const names = new Set<string>();
  let count = 0;
  let expanded = 0;
  let extracted: ReturnType<typeof unzipSync>;
  try {
    extracted = unzipSync(bytes, {
      filter(file) {
        const name = safeMemberName(file.name);
        const collisionKey = name.toLowerCase();
        count += 1;
        expanded += file.originalSize;
        if (
          count > maximumEntries ||
          file.originalSize > maximumArchiveBytes ||
          expanded > maximumExpandedBytes ||
          names.has(collisionKey)
        ) {
          return fail("BAMBU_ARCHIVE_LIMIT");
        }
        names.add(collisionKey);
        if (name === plateMember) {
          if (file.originalSize === 0 || file.originalSize > maximumPlateBytes) {
            return fail("BAMBU_ARCHIVE_PLATE_INVALID");
          }
          return true;
        }
        return false;
      },
    });
  } catch (error) {
    if (error instanceof TypeError && error.message.startsWith("BAMBU_")) {
      throw error;
    }
    return fail("BAMBU_ARCHIVE_INVALID");
  }
  if (!Object.hasOwn(extracted, plateMember)) {
    return fail("BAMBU_ARCHIVE_PLATE_MISSING");
  }
  return Object.freeze({
    bytes,
    digest,
    length,
    parser,
    memberMd5: createHash("md5").update(extracted[plateMember]!).digest("hex"),
  });
};
