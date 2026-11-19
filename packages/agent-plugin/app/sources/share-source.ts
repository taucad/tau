import { Link2 } from 'lucide-react';
import { sharePasswordLimits } from '@taucad/project-core/share-artifact';
import { createDirectShareUrlFromArchive } from '@taucad/project-core/share-direct';
import { tauViewerToolName } from '@taucad/mcp/viewer-protocol';
import type { TauViewerDirectShare, TauViewerModel } from '@taucad/mcp/viewer-protocol';
import type {
  ShareLinkMethod,
  ShareLinkOutcome,
  ShareLinkRequest,
  ShareMethodIcon,
  ShareSource,
} from '@taucad/workbench-panes/share/share-source';
import type { HostBridge } from '#app/host-bridge.js';

/** The app-visible tool that packs a shown model's project for the direct link. */
export const appShareLinkTool = tauViewerToolName.appShareLink;

const fieldOf = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null ? (value as Readonly<Record<string, unknown>>)[key] : undefined;

const isDirectShareAnswer = (value: unknown): value is TauViewerDirectShare =>
  fieldOf(value, 'kind') === 'direct' &&
  typeof fieldOf(value, 'origin') === 'string' &&
  typeof fieldOf(value, 'encodedArchive') === 'string' &&
  Array.isArray(fieldOf(value, 'warnings'));

const shareFailed = "Couldn't create the link. Try again.";

/**
 * The sentence for a refusal from the server: too large has its own, anything else is a failure to try again.
 *
 * @param answer - What the tool answered in place of a packed project.
 * @returns One sentence for the pane.
 */
const refusalMessage = (answer: unknown): string =>
  fieldOf(answer, 'errorCode') === 'SHARE_ARTIFACT_LIMIT'
    ? 'This project is too large for a direct link.'
    : shareFailed;

/**
 * The Tau app's sentence for imported files the link leaves out, then any other warning the server gave, in its own
 * words.
 *
 * @param warnings - The packed project's warnings.
 * @returns The one warning the pane shows, or `undefined`.
 */
const describeWarnings = (warnings: TauViewerDirectShare['warnings']): string | undefined => {
  const unresolved = warnings.filter(({ code }) => code === 'UNRESOLVED_DEPENDENCY').length;
  const sentences = [
    ...(unresolved > 0
      ? [
          unresolved === 1
            ? "1 imported file couldn't be found and isn't in the link. The model may not build for people who open it."
            : `${String(unresolved)} imported files couldn't be found and aren't in the link. The model may not build for people who open it.`,
        ]
      : []),
    ...warnings.filter(({ code }) => code !== 'UNRESOLVED_DEPENDENCY').map(({ message }) => message),
  ];
  return sentences.length > 0 ? sentences.join(' ') : undefined;
};

const directIcon: ShareMethodIcon = Link2;

/**
 * The desktop's direct link: the server packs the shown entry's project, and the page makes the link from it, sealing
 * it under the password here (the desktop seals in the browser too), so the password never leaves the page.
 *
 * @param bridge - The page's host bridge.
 * @param model - The shown model.
 * @returns The method.
 */
const directMethod = (bridge: HostBridge, model: TauViewerModel): ShareLinkMethod => ({
  kind: 'link',
  id: 'direct',
  label: 'Direct link',
  icon: directIcon,
  description: 'The whole project travels in the link, so anyone with the link can open it. Nothing is uploaded.',
  encryption: {
    minBytes: sharePasswordLimits.minBytes,
    maxBytes: sharePasswordLimits.maxBytes,
  },
  /* The link is the project as it is now, so every press packs it again and nothing is held. */
  shouldRemakeLink: true,
  action: { label: 'Copy link', icon: directIcon },
  share: async ({ protection, signal }: ShareLinkRequest): Promise<ShareLinkOutcome> => {
    let warning: string | undefined;
    try {
      const answer = await bridge.callTool(appShareLinkTool, { modelId: model.id });
      if (!isDirectShareAnswer(answer)) {
        return { error: refusalMessage(answer) };
      }
      warning = describeWarnings(answer.warnings);
      const { url } = await createDirectShareUrlFromArchive({
        origin: answer.origin,
        encodedArchive: answer.encodedArchive,
        protection,
        signal,
      });
      return { url, warning };
    } catch {
      return { error: shareFailed, warning };
    }
  },
});

/**
 * The Share pane's source on the viewer page: the desktop's "Direct link", its one method.
 *
 * The direct link is the one the Tau desktop's Share pane makes: the project packed into the URL, optionally sealed
 * under a password. The hosted and Gist links need a Tau or GitHub account the page cannot sign in to. With one method
 * the pane draws no method picker, as the desktop's does for a single method.
 *
 * @param bridge - The page's host bridge; the packed project comes from {@link appShareLinkTool}.
 * @param model - The model the page shows; its id names the project and entry on the server.
 * @returns A source with the direct link.
 */
export function createShareSource(bridge: HostBridge, model: TauViewerModel): ShareSource {
  return {
    methods: [directMethod(bridge, model)],
  };
}
