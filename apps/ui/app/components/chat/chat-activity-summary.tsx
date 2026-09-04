import { AnimatedShinyText } from '#components/magicui/animated-shiny-text.js';
import { ChatToolLabel } from '#components/chat/chat-tool-label.js';
import { ChatToolDescription } from '#components/chat/chat-tool-text.js';

type ChatActivitySummaryProps = {
  /** Past-tense verb fragment, e.g. `"Explored"`. Rendered when the header is closed. */
  readonly verb: string;
  /**
   * Present-participle counterpart of {@link verb}, e.g. `"Exploring"`. Rendered
   * when the header is open. Falls back to {@link verb} when empty so callers
   * that do not yet supply both forms still get a sensible label.
   */
  readonly verbActive: string;
  /** Detail fragment, e.g. `"12 searches, 2 fetches"`. Rendered de-emphasized when closed. */
  readonly detail: string;
  /**
   * When true, the activity is still live — i.e. it has not been "concluded"
   * by a downstream message part (text, export, context event, …). Live
   * activities render only the present-participle verb followed by an
   * ellipsis (e.g. `Exploring…`) wrapped in the same shimmer treatment used
   * by individual loading tool cards (see {@link AnimatedShinyText}), so the
   * outer activity title visually matches the in-flight tool rows beneath it.
   */
  readonly isActive?: boolean;
};

/**
 * Two-tone summary label shared by {@link ChatActivitySection} (outer fold)
 * and `ChatActivityGroup` (inner fold).
 *
 * Concluded state (`isActive=false`): `${verb} ${detail}` with verb emphasized
 * (e.g. `Explored 12 searches, 2 fetches`).
 *
 * Live state (`isActive=true`): `${verbActive}…` (verb-only with an ellipsis,
 * e.g. `Exploring…`) rendered with the shared shimmer animation so the
 * activity header reads as in-flight at a glance, matching the per-tool
 * loading state. The tense is fixed by whether the activity is still
 * trailing/in-progress, independent of whether the user has expanded or
 * collapsed the surrounding fold.
 */
export function ChatActivitySummary({
  verb,
  verbActive,
  detail,
  isActive = false,
}: ChatActivitySummaryProps): React.ReactNode {
  if (isActive) {
    const activeVerb = verbActive === '' ? verb : verbActive;
    if (activeVerb === '') {
      return undefined;
    }
    return <AnimatedShinyText className='shrink-0 font-medium'>{`${activeVerb}…`}</AnimatedShinyText>;
  }

  if (verb === '') {
    return undefined;
  }

  return (
    <ChatToolLabel verb={verb}>
      {detail === '' ? undefined : <ChatToolDescription>{detail}</ChatToolDescription>}
    </ChatToolLabel>
  );
}
