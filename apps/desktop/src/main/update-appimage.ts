/** Keep the maintained AppImage downloader, replacing only its unsafe installation boundary. */
import { app } from 'electron';
import { AppImageUpdater } from 'electron-updater';

import {
  acknowledgeHealthyAppImage,
  prepareAppImageInstallation,
  validateAppImageLocation,
} from '#main/appimage-transaction.js';
import type { AppImageCandidate, AppImageInstallation } from '#main/appimage-transaction.js';
import { authenticateRunningAppImage } from '#main/appimage-running-identity.js';
import type { AppImageInstallationIdentity } from '#main/appimage-running-identity.js';

/** The main process calls prepare/commit through the shared save gate; ordinary quit never installs. */
class SafeAppImageUpdater extends AppImageUpdater {
  public readonly outerImagePath: string;
  private baseline: string | undefined;
  /* Whether this launch acknowledged a healthy start; without it an update may only go forward (D8, B22). */
  private acknowledged = false;
  private readonly installation: AppImageInstallationIdentity;
  private readonly installedVersion: string;

  public constructor(
    options: ConstructorParameters<typeof AppImageUpdater>[0],
    installation: AppImageInstallationIdentity,
  ) {
    super(options);
    this.autoInstallOnAppQuit = false;
    this.autoRunAppAfterInstall = false;
    this.disableDifferentialDownload = true;
    this.allowDowngrade = false;
    this.outerImagePath = validateAppImageLocation(process.env['APPIMAGE'] ?? '');
    this.installation = installation;
    this.installedVersion = app.getVersion();
  }

  /** Authenticate the running image against its signed release without recording it as healthy. */
  public authenticate(document: unknown): string {
    if (this.installation.version !== this.installedVersion) {
      throw new Error('AppImage mounted identity differs from the running application');
    }
    const baseline = authenticateRunningAppImage({
      current: this.outerImagePath,
      installation: this.installation,
      document,
    });
    this.baseline = baseline;
    return baseline;
  }

  /** Authenticate the running image and record it as the last healthy one. */
  public markHealthy(document: unknown): void {
    const baseline = this.authenticate(document);
    acknowledgeHealthyAppImage({
      current: this.outerImagePath,
      expectedCurrent: baseline,
      version: this.installedVersion,
    });
    this.acknowledged = true;
  }

  public async prepareInstallation(candidate: AppImageCandidate): Promise<AppImageInstallation> {
    if (!this.baseline) {
      throw new Error('AppImage running release has not been authenticated');
    }
    if (this.installerPath !== candidate.path) {
      throw new Error('AppImage installation must use the candidate verified by this updater');
    }
    return prepareAppImageInstallation({
      current: this.outerImagePath,
      expectedCurrent: this.baseline,
      candidate,
      allowUnacknowledged: !this.acknowledged,
    });
  }

  protected override doInstall(): boolean {
    this.dispatchError(new Error('AppImage installation requires the explicit save and commit gate'));
    return false;
  }
}

/** Construct an explicit platform backend; importing this module never selects the global updater singleton. */
export const createSafeAppImageUpdater = (
  publishOptions: ConstructorParameters<typeof AppImageUpdater>[0],
  installation: AppImageInstallationIdentity,
): SafeAppImageUpdater => new SafeAppImageUpdater(publishOptions, installation);
