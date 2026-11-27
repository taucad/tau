import { createIsometricCaptureCamera } from '@taucad/agent-tools/capture';

/**
 * The field of view a project card's live preview opens with; its `CadPreviewProvider` seeds it. It is the card
 * thumbnail's, so the preview frames the model where the thumbnail drew it. It lives apart from `project-card.tsx` so
 * the capture camera loads with the live preview's chunk, not on Home's interactive tier.
 */
export const projectCardVerticalFieldOfView = createIsometricCaptureCamera().projection.verticalFieldOfView;
