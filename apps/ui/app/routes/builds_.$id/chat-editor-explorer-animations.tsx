import { Film } from 'lucide-react';
import { useState } from 'react';
import { Tree } from '#components/magicui/file-tree.js';
import { ExplorerFile } from '#routes/builds_.$id/chat-editor-explorer-file.js';
import { ChatEditorExplorerNoItems } from '#routes/builds_.$id/chat-editor-explorer-no-items.js';

export type AnimationItem = {
  readonly id: string;
  readonly name: string;
  readonly duration: number;
  readonly frameCount: number;
  readonly type?: 'keyframe' | 'skeletal' | 'morph';
};

// Mock animation data
const mockAnimations: readonly AnimationItem[] = [
  { id: 'anim-1', name: 'Camera Pan', duration: 5.0, frameCount: 150, type: 'keyframe' },
  { id: 'anim-2', name: 'Bridge Assembly', duration: 10.0, frameCount: 300, type: 'skeletal' },
  { id: 'anim-3', name: 'Material Fade', duration: 2.5, frameCount: 75, type: 'keyframe' },
];

type ChatEditorExplorerAnimationsProps = {
  readonly animations?: readonly AnimationItem[];
  readonly onAnimationSelect?: (animationId: string) => void;
};

export function ChatEditorExplorerAnimations({
  animations = mockAnimations,
  onAnimationSelect,
}: ChatEditorExplorerAnimationsProps): React.JSX.Element {
  const [selectedAnimationId, setSelectedAnimationId] = useState<string | undefined>(undefined);

  const handleAnimationClick = (animationId: string) => {
    setSelectedAnimationId(animationId);
    onAnimationSelect?.(animationId);
  };

  if (animations.length === 0) {
    return <ChatEditorExplorerNoItems message="No animations available" />;
  }

  const treeElements = animations.map((animation) => ({
    id: animation.id,
    name: animation.name,
    isSelectable: true,
  }));

  return (
    <Tree elements={treeElements} className="px-1">
      {animations.map((animation) => {
        const isSelected = selectedAnimationId === animation.id;
        
        return (
          <ExplorerFile
            key={animation.id}
            id={animation.id}
            name={animation.name}
            icon={<Film className="size-4" />}
            isSelected={isSelected}
            onClick={() => {
              handleAnimationClick(animation.id);
            }}
          />
        );
      })}
    </Tree>
  );
}

