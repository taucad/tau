import { useRef, useEffect } from 'react';
import { CodeViewer } from './code-viewer';

// TODO: This is a temporary component to allow for editing of the code in the chat.
// It should be replaced with a more permanent component that allows for editing of the code in the chat.
export function EditableCodeViewer({
  code,
  onChange,
  language,
  ...rest
}: {
  code: string;
  onChange: (code: string) => void;
  language: string;
  className?: string;
}) {
  const textareaReference = useRef<HTMLTextAreaElement | null>(null);
  const syntaxHighlighterReference = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const textarea = textareaReference.current;
    const syntaxHighlighter = syntaxHighlighterReference.current;

    if (textarea && syntaxHighlighter) {
      const syncScroll = (source: HTMLElement, target: HTMLElement) => {
        target.scrollTop = source.scrollTop;
        target.scrollLeft = source.scrollLeft;
      };

      const handleTextareaScroll = () => {
        if (syntaxHighlighter) {
          syncScroll(textarea, syntaxHighlighter);
        }
      };

      const handleSyntaxHighlighterScroll = () => {
        if (textarea) {
          syncScroll(syntaxHighlighter, textarea);
        }
      };

      textarea.addEventListener('scroll', handleTextareaScroll);
      syntaxHighlighter.addEventListener('scroll', handleSyntaxHighlighterScroll);

      return () => {
        textarea.removeEventListener('scroll', handleTextareaScroll);
        syntaxHighlighter.removeEventListener('scroll', handleSyntaxHighlighterScroll);
      };
    }
  }, []);

  return (
    <div className="relative flex flex-col h-full overflow-y-auto">
      <textarea
        ref={textareaReference}
        className="absolute inset-0 pl-10 pt-2.5 pb-0 leading-6 resize-none bg-transparent text-transparent p-2 font-mono text-xs caret-primary outline-none"
        value={code}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
        autoCorrect="off"
      />
      <div ref={syntaxHighlighterReference} className="overflow-auto">
        <CodeViewer language={language} className="text-xs" showLineNumbers showInlineLineNumbers {...rest}>
          {code}
        </CodeViewer>
      </div>
    </div>
  );
}
