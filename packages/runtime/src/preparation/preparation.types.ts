// The `tau-plugin.json` schema v1 contract for native runtime payloads, the closure receipt and the host
// indicators a variant is selected on. Types only; `plugin-deployment.ts` validates manifests against them.

/**
 * W3C Subresource Integrity, exactly as `package-lock.json` `integrity`: padded base64 of a sha256, sha384 or sha512
 * digest. Publishers' hex digests are transcoded by the manifest generator from bytes it verified.
 * @public
 */
export type Integrity = `${'sha256' | 'sha384' | 'sha512'}-${string}`;

/**
 * Where a closure runs. A native target is `(os, arch)` on macOS and Windows and `(os, arch, libc)` on Linux, with
 * optional floors the generator computes as the maximum of its payloads' floors. A browser target varies only on
 * pthreads behind cross-origin isolation. No CPU-feature, microarchitecture or SIMD axis exists: every ecosystem
 * resolves CPU features inside its binaries.
 * @public
 */
export type DependencyTarget =
  | { readonly runtime: 'browser'; readonly threads?: boolean }
  | {
      readonly runtime: 'native';
      readonly os: 'darwin' | 'win32';
      readonly arch: 'arm64' | 'x64';
      /** Lowest OS version every payload supports, such as macOS `12.0`. */
      readonly minimumOsVersion?: string;
    }
  | {
      readonly runtime: 'native';
      readonly os: 'linux';
      readonly arch: 'arm64' | 'x64';
      /** Required: a glibc closure never serves a musl host and vice versa. */
      readonly libc: 'glibc' | 'musl';
      /** Lowest libc version every payload supports, such as `2.31` from a `manylinux_2_31` wheel. */
      readonly minimumLibcVersion?: string;
    };

/**
 * A target axis a host can fail to satisfy.
 * @public
 */
export type VariantAxis = 'runtime' | 'os' | 'arch' | 'libc' | 'minimumOsVersion' | 'minimumLibcVersion';

/**
 * Facts about the host a variant is selected on, computed once per process and recorded in every receipt.
 * @public
 */
export type HostIndicators = {
  readonly os: 'darwin' | 'linux' | 'win32';
  readonly arch: 'arm64' | 'x64';
  readonly libc?: 'glibc' | 'musl';
  readonly libcVersion?: string;
  readonly osVersion?: string;
  /** Whether the process runs under Rosetta 2 or Windows x64 emulation; recorded and advised on, never selected on. */
  readonly translated: boolean;
  readonly wasm: { readonly threads: boolean };
};

/**
 * Where a payload's bytes come from. The digest is the identity; URLs are tried in order, the canonical registry URL
 * first.
 * @public
 */
export type PayloadOrigin =
  | { readonly kind: 'url'; readonly urls: readonly [string, ...string[]] }
  /** A file inside the declaring npm package. */
  | { readonly kind: 'packagePath'; readonly path: string }
  /** A file exported by a locked npm dependency. */
  | { readonly kind: 'packageAsset'; readonly specifier: string };

/**
 * How a payload unpacks. `raw` is one file written as `<destination>/<name>`; `wheel` is a zip whose `RECORD` lists
 * every file's digest.
 * @public
 */
export type PayloadFormat = 'raw' | 'tar.gz' | 'zip' | 'wheel';

/**
 * One pinned object of a closure.
 * @public
 */
export type DependencyPayload = {
  /** Closure-local name used by receipts and progress, such as `python`, `numpy` or `dotnet`. */
  readonly name: string;
  readonly integrity: Integrity;
  readonly byteLength: number;
  readonly format: PayloadFormat;
  readonly origin: PayloadOrigin;
  /**
   * Closure-relative POSIX directory the payload unpacks into. `.` (the closure root) is allowed only for `raw`. A
   * wheel's destination is its interpreter's `site-packages` (`<prefix>/lib/pythonX.Y/site-packages` or
   * `<prefix>/Lib/site-packages`), and its `.data/data/` files install under `<prefix>`.
   */
  readonly destination: string;
  /** Leading path segments dropped on unpack; `tar.gz` and `zip` only. */
  readonly stripComponents?: number;
  /** Declared unpacked size for free-space admission before any download; absent means four times `byteLength`. */
  readonly unpackedByteLength?: number;
};

/**
 * Every payload one target needs: a closure of several payloads with distinct origins and formats.
 * @public
 */
export type DependencyVariant = {
  readonly target: DependencyTarget;
  readonly payloads: readonly [DependencyPayload, ...DependencyPayload[]];
};

/**
 * One kernel's row: the dependencies it needs before it can be composed and the file extensions it handles.
 * @public
 */
export type KernelDeployment = {
  readonly requires: readonly [string, ...string[]];
  readonly extensions: readonly [string, ...string[]];
};

/**
 * `tau-plugin.json` schema v1, read without evaluating plugin code.
 * @public
 */
export type PluginDeployment = {
  readonly schemaVersion: 1;
  /** Dependency name to one variant per supported target. */
  readonly dependencies: Readonly<Record<string, readonly [DependencyVariant, ...DependencyVariant[]]>>;
  /** Kernel id to its requirements. */
  readonly kernels: Readonly<Record<string, KernelDeployment>>;
};

/**
 * One file of a sealed closure, as written.
 * @public
 */
export type ReceiptFile = {
  /** POSIX path relative to the closure root. */
  readonly path: string;
  readonly byteLength: number;
  /** Lowercase hex sha256 of the file's bytes; for a symlink, of the file it resolves to. */
  readonly sha256: string;
  /** Permission bits, `0o777` at most. */
  readonly mode: number;
  readonly symlinkTarget?: string;
};

/**
 * Which source served a payload's bytes; not part of any identity.
 * @public
 */
export type PayloadAcquisition = { readonly kind: 'origin' | 'mirror' | 'seed'; readonly location: string };

/**
 * What the store records for one sealed closure, written last inside staging so its presence is the seal.
 * @public
 */
export type ClosureReceipt = {
  /** The npm package that declared the dependency. */
  readonly package: string;
  readonly dependency: string;
  readonly target: DependencyTarget;
  /** How the variant was chosen: the host snapshot, the targets considered and whether an emulator was used. */
  readonly selection: {
    readonly host: HostIndicators;
    readonly candidates: readonly DependencyTarget[];
    readonly emulated: boolean;
  };
  /** Absolute and host-private: `<store>/closures/sha256/<hex>`. */
  readonly root: string;
  /** Which pins: sha256 over the newline-joined `name<TAB>integrity` rows in manifest order. */
  readonly closureIntegrity: Integrity;
  /** What the installer produced: sha256 over the canonical file rows sorted by path. */
  readonly treeIntegrity: Integrity;
  readonly files: readonly ReceiptFile[];
  /** Per payload: the pin, its sha256 store key (lowercase hex) and which source served it. */
  readonly payloads: ReadonlyArray<{
    readonly name: string;
    readonly integrity: Integrity;
    readonly sha256: string;
    readonly acquiredFrom: PayloadAcquisition;
  }>;
  /** ISO 8601 time the closure was sealed. */
  readonly preparedAt: string;
  /** Tau version that prepared it; a change makes the receipt stale. */
  readonly tauVersion: string;
};

/**
 * Stable failure codes of preparation.
 * @public
 */
export type PreparationErrorCode =
  | 'MANIFEST_INVALID'
  | 'DOWNLOAD_FAILED'
  | 'INTEGRITY_MISMATCH'
  | 'EXTRACTION_REFUSED'
  | 'STORE_EXHAUSTED';
