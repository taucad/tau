import { FolderOpen, Folder } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ToolInvocation } from '@taucad/chat';
import { toolName } from '@taucad/chat/constants';
import {
  ChatToolCard,
  ChatToolCardHeader,
  ChatToolCardIcon,
  ChatToolCardTitle,
  ChatToolCardContent,
  ChatToolCardList,
  ChatToolCardListItem,
} from '#components/chat/chat-tool-card.js';
import { ChatToolDescription } from '#components/chat/chat-tool-text.js';
import { ChatToolLabel } from '#components/chat/chat-tool-label.js';
import { ChatToolError } from '#components/chat/chat-tool-error.js';
import { FileLink } from '#components/files/file-link.js';
import { DirectoryLink } from '#components/files/directory-link.js';
import { FileExtensionIcon } from '#components/icons/file-extension-icon.js';

/**
 * Joins a parent directory path with a basename. Tolerates root-listing
 * conventions (`''`, `'/'`, `'.'`) and trailing slashes returned by the
 * `list_directory` tool.
 */
function joinChildPath(parent: string, name: string): string {
  if (!parent || parent === '/' || parent === '.') {
    return name;
  }

  return `${parent.replace(/\/$/, '')}/${name}`;
}

export function ChatMessageToolListDirectory({
  part,
}: {
  readonly part: ToolInvocation<typeof toolName.listDirectory>;
}): ReactNode {
  switch (part.state) {
    case 'input-streaming':
    case 'input-available': {
      const { input } = part;
      const path = input?.path ?? '/';

      return (
        <ChatToolCard variant='minimal' status='loading' isDefaultOpen={false}>
          <ChatToolCardHeader>
            <ChatToolCardTitle>
              <ChatToolLabel verb='Listing'>
                <ChatToolDescription>{path}...</ChatToolDescription>
              </ChatToolLabel>
            </ChatToolCardTitle>
          </ChatToolCardHeader>
        </ChatToolCard>
      );
    }

    case 'output-available': {
      const { output } = part;
      const { entries, path } = output;

      // Sort entries: directories first, then files
      const sortedEntries = [...entries].sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'dir' ? -1 : 1;
        }

        return a.name.localeCompare(b.name);
      });

      const isRoot = !path || path === '/' || path === '.';
      const headerLabel = `${path || '/'} (${entries.length} items)`;

      return (
        <ChatToolCard variant='minimal' status='ready' isDefaultOpen={false}>
          <ChatToolCardHeader>
            <ChatToolCardIcon icon={FolderOpen} />
            <ChatToolCardTitle>
              <ChatToolLabel verb='Listed'>
                <ChatToolDescription>
                  {isRoot ? headerLabel : <DirectoryLink path={path}>{headerLabel}</DirectoryLink>}
                </ChatToolDescription>
              </ChatToolLabel>
            </ChatToolCardTitle>
          </ChatToolCardHeader>
          <ChatToolCardContent>
            <ChatToolCardList maxHeight='max-h-40'>
              {sortedEntries.length === 0 ? (
                <ChatToolCardListItem className='text-muted-foreground/70 italic'>
                  (empty directory)
                </ChatToolCardListItem>
              ) : (
                sortedEntries.map((entry) => {
                  const childPath = joinChildPath(path, entry.name);

                  if (entry.type === 'dir') {
                    return (
                      <ChatToolCardListItem key={entry.name} icon={Folder}>
                        <DirectoryLink path={childPath}>{entry.name}</DirectoryLink>
                      </ChatToolCardListItem>
                    );
                  }

                  return (
                    <ChatToolCardListItem
                      key={entry.name}
                      iconNode={<FileExtensionIcon filename={entry.name} className='mt-0.5 size-3 shrink-0' />}
                    >
                      <FileLink path={childPath}>{entry.name}</FileLink>
                    </ChatToolCardListItem>
                  );
                })
              )}
            </ChatToolCardList>
          </ChatToolCardContent>
        </ChatToolCard>
      );
    }

    case 'output-error': {
      return <ChatToolError errorText={part.errorText} icon={FolderOpen} noun='directory list' />;
    }

    case 'approval-requested':
    case 'approval-responded':
    case 'output-denied': {
      throw new Error(`Unexpected ${toolName.listDirectory} state: ${part.state}`);
    }
  }
}
