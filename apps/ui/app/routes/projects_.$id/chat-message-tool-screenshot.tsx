import { Camera, XCircle } from 'lucide-react';
import type { ToolInvocation } from '@taucad/chat';
import { toolName } from '@taucad/chat/constants';
import {
  ChatToolCard,
  ChatToolCardHeader,
  ChatToolCardIcon,
  ChatToolCardTitle,
  ChatToolCardContent,
} from '#components/chat/chat-tool-card.js';
import { ChatToolDescription } from '#components/chat/chat-tool-text.js';
import { ChatToolLabel } from '#components/chat/chat-tool-label.js';
import { ChatToolError } from '#components/chat/chat-tool-error.js';
import { ViewerLink } from '#components/files/viewer-link.js';

function FilenameLink({ targetFile }: { readonly targetFile: string }): React.JSX.Element {
  return <ViewerLink path={targetFile}>{targetFile}</ViewerLink>;
}

export function ChatMessageToolScreenshot({
  part,
}: {
  readonly part: ToolInvocation<typeof toolName.screenshot>;
}): React.JSX.Element {
  const targetFile = part.input?.targetFile;

  switch (part.state) {
    case 'input-streaming':
    case 'input-available': {
      const mode = part.input?.mode;
      const subjectNoun = mode === 'multi_angle' ? 'orthographic views' : 'screenshot';

      return (
        <ChatToolCard variant='minimal' status='loading' isDefaultOpen={false}>
          <ChatToolCardHeader>
            <ChatToolCardIcon icon={Camera} />
            <ChatToolCardTitle>
              <ChatToolLabel verb='Capturing'>
                <ChatToolDescription>
                  {targetFile ? (
                    <>
                      {subjectNoun} of <FilenameLink targetFile={targetFile} />
                      ...
                    </>
                  ) : (
                    `${subjectNoun}...`
                  )}
                </ChatToolDescription>
              </ChatToolLabel>
            </ChatToolCardTitle>
          </ChatToolCardHeader>
        </ChatToolCard>
      );
    }

    case 'output-available': {
      const { output } = part;
      const allImages = output.images;
      const renderableImages = allImages.filter((img) => img.dataUrl.startsWith('data:'));
      const isComposite = allImages.length === 1 && allImages[0]?.view === 'composite';
      const count = isComposite ? 6 : allImages.length;
      const noun = count === 1 ? 'screenshot' : 'screenshots';

      return (
        <ChatToolCard variant='minimal' status='ready' isDefaultOpen={false}>
          <ChatToolCardHeader>
            <ChatToolCardIcon icon={Camera} />
            <ChatToolCardTitle>
              <ChatToolLabel verb='Captured'>
                <ChatToolDescription>
                  {targetFile ? (
                    <>
                      {count} {noun} of <FilenameLink targetFile={targetFile} />
                    </>
                  ) : (
                    `${count} ${noun}`
                  )}
                </ChatToolDescription>
              </ChatToolLabel>
            </ChatToolCardTitle>
          </ChatToolCardHeader>
          {renderableImages.length > 0 ? (
            <ChatToolCardContent>
              <div
                className={`grid gap-2 ${renderableImages.length === 1 ? 'grid-cols-1' : 'grid-cols-2 @md:grid-cols-3'}`}
              >
                {renderableImages.map((image) => (
                  <div key={image.view} className='flex flex-col items-center gap-1'>
                    <img
                      src={image.dataUrl}
                      alt={isComposite ? 'Multi-angle composite view' : `${image.view} view`}
                      className='rounded-sm border bg-background object-contain'
                    />
                    {isComposite ? undefined : <span className='text-xs text-muted-foreground'>{image.view}</span>}
                  </div>
                ))}
              </div>
            </ChatToolCardContent>
          ) : undefined}
        </ChatToolCard>
      );
    }

    case 'output-error': {
      return <ChatToolError errorText={part.errorText} icon={XCircle} noun='screenshot' />;
    }

    case 'approval-requested':
    case 'approval-responded':
    case 'output-denied': {
      throw new Error(`Unexpected ${toolName.screenshot} state: ${part.state}`);
    }
  }
}
