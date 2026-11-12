import { ChatEarlyInput } from '#components/chat/chat-early-input.js';
import { ChatComposerStaticBar } from '#components/chat/chat-composer-static-bar.js';
import { NewProjectKernelChips } from '#components/chat/kernel-selector.js';
import { useNewProjectComposer } from '#components/chat/use-new-project-composer.js';
import { useKernel } from '#hooks/use-kernel.js';
import { useFeature } from '#flags/use-feature.js';

/** The marker after Home's composer that first paint waits for (`rel=expect`). */
export const homeComposerEndId = 'home-composer-end';

/**
 * Home's composer, with the native input in the route's own bundle and the rich composer in none.
 *
 * `ChatEarlyInput` used to be rendered by `ChatTextarea`, so the whole composer graph — the rich
 * editor, the skills catalog, the file manager, the headless image service — had to be fetched and
 * evaluated before Home could accept a keystroke, even though the thing that accepts the keystroke
 * is a native textarea. Here the route imports only the native input and asks for the composer in
 * an effect, so that graph is a dynamic chunk: Home's static closure loses it, and the input that
 * satisfies the first-action contract is in the served document as before.
 *
 * The served composer has the rich one's final shape (R2): the kernel chips are drawn here, once,
 * and stay mounted across the swap, and the native input sits in the rich composer's box over its
 * bar at rest, so the swap moves nothing. The native input takes focus at first paint with the rich
 * composer's outline (R11); adoption hands its text, caret and focus to the editor.
 *
 * The handover is unchanged and still belongs to `ChatEarlyInput`: this component only withholds
 * `isHostReady` until the module is here, so the native input keeps accepting and holding text until
 * there is something to hand it to, rather than being replaced by a pending boundary. An import
 * `useNewProjectComposer` cannot complete therefore leaves the native input standing with whatever
 * the user has typed, rather than taking the draft down with the chunk.
 */
export function HomeChatComposer({
  enableAutoFocus = true,
}: {
  readonly enableAutoFocus?: boolean;
}): React.JSX.Element {
  const Composer = useNewProjectComposer();
  const { kernel, setKernel } = useKernel();
  /* With the `autoKernel` flag on the kernel is the bar's pill, beside the location, and the chips leave (D8). */
  const isAutoEnabled = useFeature('autoKernel');

  return (
    <>
      {/* Hoisted to the head by React. Until the parser reaches the marker after the composer, Chromium holds
       * rendering, so on a slow CPU the first paint can never be a half-parsed composer: a kernel row cut
       * mid-chip, a box without its bar, a model trigger without its label (gate findings 1, #1562). The held
       * region ends at the composer, not the page, so the project list still streams in after first paint. A
       * browser without `rel=expect` ignores it. */}
      <link rel='expect' href={`#${homeComposerEndId}`} blocking='render' />
      <div className='space-y-4'>
        {isAutoEnabled ? null : <NewProjectKernelChips kernel={kernel} onKernelChange={setKernel} />}
        <ChatEarlyInput
          isHostReady={Composer !== undefined}
          enableAutoFocus={enableAutoFocus}
          bar={({ isEmpty }) => <ChatComposerStaticBar isEmpty={isEmpty} />}
        >
          {(input) =>
            Composer === undefined ? null : (
              <Composer adoptedEarlyInput={input} enableAutoFocus={enableAutoFocus} enableKernelChips={false} />
            )
          }
        </ChatEarlyInput>
      </div>
      <span id={homeComposerEndId} hidden />
    </>
  );
}
