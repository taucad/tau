import { usePublishCloudProjectPreview as usePublishCloudProjectPreviewWith } from '@taucad/publish-ui/hooks/use-publish-cloud-project-preview';
import { useRevisionSessionUser } from '@taucad/revisions-ui/lib/revision-actor';
import { ENV } from '#environment.config.js';
import { useProjectThumbnail } from '#hooks/use-project-thumbnail.js';

/* Read when an upload is sent, as before the hook moved. */
const apiBaseUrl = (): string => ENV.TAU_API_URL;

/**
 * `@taucad/publish-ui`'s saved-preview producer with this app's session user, project thumbnail and API base. Mount
 * inside the project file-manager scope.
 *
 * @param options - The project, whether publication may begin, whether fresh captures are remembered, and whether this
 *   consumer backfills.
 * @returns The capture callback: hand it the bytes of a fresh local capture.
 */
export const usePublishCloudProjectPreview = (
  options: Readonly<{ projectId: string; enabled: boolean; captureEnabled?: boolean; backfill?: boolean }>,
): ((bytes: Uint8Array<ArrayBuffer>) => void) => {
  const thumbnail = useProjectThumbnail(options.projectId);
  const userId = useRevisionSessionUser()?.id;

  return usePublishCloudProjectPreviewWith({ ...options, userId, thumbnail, apiBaseUrl });
};
