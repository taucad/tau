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

  public markHealthy(document: unknown): void {
    if (this.installation.version !== this.installedVersion) {
      throw new Error('AppImage mounted identity differs from the running application');
    }
    const baseline = authenticateRunningAppImage({
      current: this.outerImagePath,
      installation: this.installation,
      document,
    });
    acknowledgeHealthyAppImage({
      current: this.outerImagePath,
      expectedCurrent: baseline,
      version: this.installedVersion,
    });
    this.baseline = baseline;
  }

  public async prepareInstallation(candidate: AppImageCandidate): Promise<AppImageInstallation> {
    if (!this.baseline) {
      throw new Error('AppImage running release has no authenticated healthy acknowledgement');
    }
    if (this.installerPath !== candidate.path) {
      throw new Error('AppImage installation must use the candidate verified by this updater');
    }
    return prepareAppImageInstallation({ current: this.outerImagePath, expectedCurrent: this.baseline, candidate });
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
