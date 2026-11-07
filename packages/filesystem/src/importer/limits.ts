/**
 * The one limits policy every import obeys (charter D12, EQ14), and the meter
 * that enforces it while entries stream.
 *
 * A zip, a folder, a dropped tree and a downloaded archive all pass the same
 * numbers: the archive's own size, the bytes it expands to, the largest file,
 * the expansion ratio, the longest path and the entry count. Each is checked
 * against what a source declares before a byte is decoded, and again against
 * what the decode actually produced, so a header that lies is caught by the
 * bytes and a bomb is refused before it fills memory or disk.
 *
 * @module
 */

const mebibyte = 1024 * 1024;
const gibibyte = 1024 * mebibyte;

/**
 * The bounds of one import.
 *
 * @public
 */
export type ImportLimits = Readonly<{
  /** Largest archive (zip or downloaded bundle) read, in bytes. */
  maximumArchiveBytes: number;
  /** Largest total of every imported file's bytes. */
  maximumExpandedBytes: number;
  /** Largest single file. */
  maximumFileBytes: number;
  /** Largest expansion of the archive as a whole, and of any entry above {@link ratioFloorBytes}. */
  maximumRatio: number;
  /** Longest project-relative path, in UTF-8 bytes. */
  maximumPathBytes: number;
  /** Most entries a source may list, directories and skipped entries included. */
  maximumEntries: number;
}>;

/**
 * The import limits (EQ14): 1 GiB archive and expanded, 100 MiB per file,
 * ratio 100, 1 KiB paths, 50,000 entries.
 *
 * @public
 */
export const importLimits: ImportLimits = Object.freeze({
  maximumArchiveBytes: gibibyte,
  maximumExpandedBytes: gibibyte,
  maximumFileBytes: 100 * mebibyte,
  maximumRatio: 100,
  maximumPathBytes: 1024,
  maximumEntries: 50_000,
});

/**
 * Entries this small are not judged by their own ratio: a kilobyte of
 * whitespace compresses past 100 to 1 and is no bomb. The archive's overall
 * ratio still counts them.
 *
 * @public
 */
export const ratioFloorBytes = mebibyte;

/**
 * Why an import was refused. The size reasons name the limit that was hit;
 * the rest name what was wrong with the source.
 *
 * @public
 */
export type ImportRefusalReason =
  | 'archiveTooLarge'
  | 'expandedTooLarge'
  | 'fileTooLarge'
  | 'ratioTooHigh'
  | 'pathTooLong'
  | 'tooManyEntries'
  | 'unsafePath'
  | 'collision'
  | 'encrypted'
  | 'unsupported'
  | 'corrupt'
  | 'empty';

const describe = (reason: ImportRefusalReason, limits: ImportLimits): string => {
  const inMebibytes = (bytes: number): string => `${String(Math.round(bytes / mebibyte))} MB`;
  switch (reason) {
    case 'archiveTooLarge': {
      return `The archive is larger than the ${inMebibytes(limits.maximumArchiveBytes)} import limit.`;
    }
    case 'expandedTooLarge': {
      return `The files are larger than the ${inMebibytes(limits.maximumExpandedBytes)} import limit.`;
    }
    case 'fileTooLarge': {
      return `A file is larger than the ${inMebibytes(limits.maximumFileBytes)} per-file import limit.`;
    }
    case 'ratioTooHigh': {
      return `The archive expands more than ${String(limits.maximumRatio)} times its size, which an import refuses.`;
    }
    case 'pathTooLong': {
      return `A path is longer than ${String(limits.maximumPathBytes)} bytes.`;
    }
    case 'tooManyEntries': {
      return `The import has more than ${String(limits.maximumEntries)} entries.`;
    }
    case 'unsafePath': {
      return 'A path leaves the project folder.';
    }
    case 'collision': {
      return 'Two paths differ only in case or accents, or a file sits where a folder is.';
    }
    case 'encrypted': {
      return 'The archive is encrypted.';
    }
    case 'unsupported': {
      return 'The archive uses a compression method an import does not read.';
    }
    case 'corrupt': {
      return 'The archive is damaged.';
    }
    case 'empty': {
      return 'There are no files to import.';
    }
  }
};

/**
 * An import refused by the limits policy or the path policy. Its message is a
 * sentence the person can act on; `path` names the entry when one is to blame.
 *
 * @public
 */
export class ImportRefusedError extends Error {
  public override readonly name = 'ImportRefusedError';

  /** What was refused. */
  public readonly reason: ImportRefusalReason;

  /** The source path the refusal is about, when it is about one entry. */
  public readonly path: string | undefined;

  /**
   * Refuse an import.
   *
   * @param reason - What was refused.
   * @param options - The entry to blame, the limits in force (for the message), and a cause.
   */
  public constructor(
    reason: ImportRefusalReason,
    options: Readonly<{ path?: string; limits?: ImportLimits; cause?: unknown; message?: string }> = {},
  ) {
    const sentence = options.message ?? describe(reason, options.limits ?? importLimits);
    super(
      options.path === undefined ? sentence : `${sentence} (${options.path})`,
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.reason = reason;
    this.path = options.path;
  }
}

/**
 * Whether an error is an import refusal, including one revived from a worker
 * by name (a compute worker sends its errors back as name and message).
 *
 * @param error - Anything thrown.
 * @returns Whether it is a refusal.
 * @public
 */
export const isImportRefusal = (error: unknown): error is Error =>
  error instanceof ImportRefusedError ||
  (error instanceof Error && (error as { workerErrorName?: unknown }).workerErrorName === 'ImportRefusedError');

/**
 * The meter one import runs: every count and total in one place, checked as
 * each entry is listed and again as its bytes are decoded.
 *
 * @public
 */
export class ImportMeter {
  private readonly _limits: ImportLimits;
  private _entries = 0;
  private _declared = 0;
  private _decoded = 0;
  private _archiveBytes: number | undefined;

  /**
   * Meter one import.
   *
   * @param limits - The policy; {@link importLimits} unless a test narrows it.
   */
  public constructor(limits: ImportLimits = importLimits) {
    this._limits = limits;
  }

  /** The policy in force. */
  public get limits(): ImportLimits {
    return this._limits;
  }

  /** Bytes every accepted entry declared. */
  public get declaredBytes(): number {
    return this._declared;
  }

  /** Bytes decoded so far. */
  public get decodedBytes(): number {
    return this._decoded;
  }

  /**
   * Count an archive's size, before its directory is read.
   *
   * @param bytes - The archive's size, declared or measured.
   */
  public archive(bytes: number): void {
    if (bytes > this._limits.maximumArchiveBytes) {
      throw new ImportRefusedError('archiveTooLarge', { limits: this._limits });
    }
    this._archiveBytes = bytes;
  }

  /**
   * Count one listed entry, whether it is kept or skipped.
   *
   * @param path - The entry's source path, for the message.
   */
  public listed(path: string): void {
    this._entries += 1;
    if (this._entries > this._limits.maximumEntries) {
      throw new ImportRefusedError('tooManyEntries', { limits: this._limits, path });
    }
  }

  /**
   * Check one path's length.
   *
   * @param path - A normalized project-relative path.
   */
  public path(path: string): void {
    if (new TextEncoder().encode(path).byteLength > this._limits.maximumPathBytes) {
      throw new ImportRefusedError('pathTooLong', { limits: this._limits, path: path.slice(0, 120) });
    }
  }

  /**
   * Count one kept file by the size its source declares.
   *
   * @param path - The entry's path, for the message.
   * @param size - Its declared size.
   * @param compressedSize - Its stored size inside an archive, when it has one.
   */
  public declared(path: string, size: number, compressedSize?: number): void {
    if (!Number.isSafeInteger(size) || size < 0) {
      throw new ImportRefusedError('corrupt', { limits: this._limits, path });
    }
    if (size > this._limits.maximumFileBytes) {
      throw new ImportRefusedError('fileTooLarge', { limits: this._limits, path });
    }
    if (
      compressedSize !== undefined &&
      size > ratioFloorBytes &&
      size > Math.max(compressedSize, 1) * this._limits.maximumRatio
    ) {
      throw new ImportRefusedError('ratioTooHigh', { limits: this._limits, path });
    }
    this._declared += size;
    this._checkTotal(this._declared, path);
  }

  /**
   * Count bytes as they are decoded.
   *
   * @param bytes - Bytes one decode produced.
   * @param path - The entry, for the message.
   */
  public decoded(bytes: number, path: string): void {
    this._decoded += bytes;
    this._checkTotal(this._decoded, path);
  }

  private _checkTotal(total: number, path: string): void {
    if (total > this._limits.maximumExpandedBytes) {
      throw new ImportRefusedError('expandedTooLarge', { limits: this._limits, path });
    }
    if (
      this._archiveBytes !== undefined &&
      total > ratioFloorBytes &&
      total > Math.max(this._archiveBytes, 1) * this._limits.maximumRatio
    ) {
      throw new ImportRefusedError('ratioTooHigh', { limits: this._limits, path });
    }
  }
}
