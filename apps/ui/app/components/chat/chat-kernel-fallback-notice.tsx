import { useChatComposer } from '#hooks/active-chat-provider.js';
import { isDesktopTarget } from '#lib/build-target.js';

/**
 * Which kernel the chat runs when its own cannot run here, and why
 * (cross-device chat handoff, XD5).
 *
 * A native kernel only Tau Desktop advertises is not executable on the web,
 * so the chat runs the device's kernel instead. The chat keeps its own, which
 * returns wherever that kernel runs; this line keeps the substitution from
 * being silent. The kernel control beside it already names the kernel used.
 *
 * @returns The notice, or nothing while the chat's own kernel runs here.
 * @public
 */
export function ChatKernelFallbackNotice(): React.JSX.Element | undefined {
  const {
    kernel: { kernel, unavailableKernel },
  } = useChatComposer();
  if (unavailableKernel === undefined) {
    return undefined;
  }
  const why = isDesktopTarget() ? 'isn’t available on this computer' : 'runs in Tau Desktop';
  return (
    <p role='status' className='px-3 pb-2 text-xs text-muted-foreground'>
      {`${unavailableKernel.name} ${why}, so this chat uses ${kernel.name} here.`}
    </p>
  );
}
