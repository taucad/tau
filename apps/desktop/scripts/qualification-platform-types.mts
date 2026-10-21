/** Native qualification drivers report observations; only the orchestrator may decide acceptance. */
import { parseDesktopArtifactManifest } from '#shared/desktop-release.js';
import type { DesktopArtifactManifest } from '#shared/desktop-release.js';

export type QualificationRoute = 'macos-zip' | 'macos-dmg' | 'windows-nsis' | 'linux-apt' | 'linux-appimage';
export type QualificationCandidate = {
  manifest: DesktopArtifactManifest;
  artifactDirectory: string;
  route: QualificationRoute;
};
/** Missing host prerequisites are undecided qualification, never a passed security check. */
export class QualificationUnavailable extends Error {
  public readonly reason: string;

  public constructor(reason: string) {
    super(reason);
    this.reason = reason;
    this.name = 'QualificationUnavailable';
  }
}
export type QualificationProcesses = {
  mainPid: number;
  rendererPids: number[];
  nativeChildPids: number[];
};
export type QualificationProcessObservation = {
  pid: number;
  executable: string;
  commandLine: string;
  /** Raw OS measurements retain distinctions between unavailable and disabled protection. */
  measurements: Record<string, string>;
};
export type QualificationSecurity = {
  platform: string;
  architecture: string;
  osVersion: string;
  measurements: Record<string, string>;
  processes: QualificationProcessObservation[];
};
export type QualificationInstallation = {
  route: QualificationRoute;
  channel: 'production' | 'staging';
  tag: string;
  version: string;
  sourceCommit: string;
  executablePath: string;
  executableSha256: string;
  asarSha256: string;
  /** AppImage uses its stable outer path; APT uses the selected immutable generation. */
  installationPath: string;
  artifactSha256?: string;
  measurements: Record<string, string>;
};
export type QualificationPreservedFile = { path: string; sha256: string };
export type QualificationPlatformDriver = {
  /** Initial baseline only. Subsequent replacements belong to the shipping updater or OS scheduler. */
  install(candidate: QualificationCandidate): Promise<QualificationInstallation>;
  /** Reinstall only the exact last observed candidate after this driver successfully removed it. */
  reinstall(
    candidate: QualificationCandidate,
    preservedFiles: readonly QualificationPreservedFile[],
  ): Promise<QualificationInstallation>;
  observe(candidate: QualificationCandidate): Promise<QualificationInstallation>;
  measureSecurity(processes: QualificationProcesses): Promise<QualificationSecurity>;
  remove(preservedFiles: readonly QualificationPreservedFile[]): Promise<void>;
};
export type QualificationDriverOptions = {
  /** Fixture is explicit test trust and cannot produce release acceptance receipts. */
  mode: 'release' | 'fixture';
  installationPath: string;
};

/** Bind recovery installation to this driver's own lifecycle and unchanged retention contract. */
export const createQualificationReinstallGuard = (): {
  installed(): void;
  observed(candidate: QualificationCandidate): void;
  assertRemoval(): void;
  removed(files: readonly QualificationPreservedFile[]): void;
  admit(candidate: QualificationCandidate, files: readonly QualificationPreservedFile[]): void;
} => {
  let owned = false;
  let removed = false;
  let identity = '';
  let preserved = '';
  const candidateKey = (candidate: QualificationCandidate): string =>
    JSON.stringify({
      route: candidate.route,
      manifest: parseDesktopArtifactManifest(candidate.manifest),
    });
  const filesKey = (files: readonly QualificationPreservedFile[]): string =>
    JSON.stringify(files.map((file) => `${file.path}\0${file.sha256}`).sort());
  return {
    installed(): void {
      owned = true;
    },
    observed(candidate: QualificationCandidate): void {
      identity = candidateKey(candidate);
    },
    assertRemoval(): void {
      if (!owned || removed || !identity) {
        throw new Error('Removal lacks an owned observed installation');
      }
    },
    removed(files: readonly QualificationPreservedFile[]): void {
      if (!owned || removed || !identity) {
        throw new Error('Removal lacks an owned observed installation');
      }
      preserved = filesKey(files);
      removed = true;
    },
    admit(candidate: QualificationCandidate, files: readonly QualificationPreservedFile[]): void {
      if (!owned || !removed || candidateKey(candidate) !== identity || filesKey(files) !== preserved) {
        throw new Error('Reinstall requires own completed removal, exact last observed candidate and preserved files');
      }
      removed = false;
    },
  };
};
