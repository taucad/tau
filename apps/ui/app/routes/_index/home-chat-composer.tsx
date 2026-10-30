import { ChatEarlyInput } from '#components/chat/chat-early-input.js';
import { useNewProjectComposer } from '#components/chat/use-new-project-composer.js';

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

  return (
    <ChatEarlyInput isHostReady={Composer !== undefined}>
      {(input) =>
        Composer === undefined ? null : <Composer adoptedEarlyInput={input} enableAutoFocus={enableAutoFocus} />
      }
    </ChatEarlyInput>
  );
}
