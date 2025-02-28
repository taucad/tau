import { CodeEditor } from '@/components/code-editor';
import { useBuild } from '@/hooks/use-build2';
import { LoaderPinwheel } from 'lucide-react';
import { useCallback } from 'react';
export const ChatCode = () => {
  const { setCode, code } = useBuild();

  const handleCodeChange = useCallback(
    (value?: string) => {
      if (value) {
        setCode(value);
      }
    },
    [setCode],
  );

  return (
    <>
      {/* <div className="flex flex-row justify-between items-center top-0 right-0 absolute my-2 mr-12 gap-1.5">
        <CopyButton variant="outline" size="icon" text={code} className="text-muted-foreground" tooltip="Copy code" />
        <DownloadButton
          variant="outline"
          size="icon"
          text={code}
          className="text-muted-foreground"
          tooltip="Download code"
        />
      </div> */}
      <CodeEditor
        //
        loading={<LoaderPinwheel className="size-20 stroke-1 animate-spin text-primary ease-in-out" />}
        className="text-xs bg-background"
        defaultLanguage="typescript"
        defaultValue={code}
        onChange={handleCodeChange}
      />
    </>
  );
};
