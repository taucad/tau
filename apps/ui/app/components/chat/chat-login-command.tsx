import { CopyButton } from '@taucad/ui/components/copy-button';
import {
  CodeBlock,
  CodeBlockAction,
  CodeBlockContent,
  CodeBlockHeader,
  Pre,
} from '@taucad/editor-ui/components/code/code-block';

/**
 * One sign-in command line in the login card, in the shared code block with its copy action.
 *
 * Loaded lazily by `ChatLoginAffordance`: the code block brings the syntax highlighter, which the Home page's critical
 * path must not carry for a card that only shows when an agent asks for sign-in.
 *
 * @param props - The command line to show.
 * @returns The command in a floating code block.
 * @public
 */
export function ChatLoginCommand({ command }: { readonly command: string }): React.JSX.Element {
  return (
    <CodeBlock variant='floating'>
      <CodeBlockHeader variant='floating'>
        <CodeBlockAction variant='floating' visibility='alwaysVisible'>
          <CopyButton size='icon-xs' tooltip='Copy command' getText={() => command} />
        </CodeBlockAction>
      </CodeBlockHeader>
      <CodeBlockContent className='py-1.5 pr-9 pl-2.5'>
        <Pre className='font-mono text-xs wrap-anywhere whitespace-pre-wrap'>{command}</Pre>
      </CodeBlockContent>
    </CodeBlock>
  );
}
