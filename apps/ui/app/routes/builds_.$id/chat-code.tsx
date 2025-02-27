import { CodeEditor } from '@/components/code-editor';
import { useReplicad } from '@/components/geometry/kernel/replicad/replicad-context';
import { LoaderPinwheel } from 'lucide-react';

export const ChatCode = () => {
  const { code, setCode } = useReplicad();

  const handleCodeChange = (value?: string) => {
    if (value) {
      console.log('value', value);
      setCode(value);
    }
  };

  return (
    // <div className="flex flex-row justify-between items-center top-0 right-0 absolute my-[0.5625rem] mr-12 gap-1.5">
    //     <CopyButton variant="outline" size="icon" text={code} className="text-muted-foreground" />
    //     <DownloadButton
    //       variant="outline"
    //       size="icon"
    //       text={code}
    //       className="text-muted-foreground"
    //       tooltip="Download Code"
    //     />
    //   </div>
    <CodeEditor
      //
      loading={<LoaderPinwheel className="size-20 stroke-1 animate-spin text-primary ease-in-out" />}
      className="text-xs bg-background"
      defaultLanguage="typescript"
      defaultValue={code}
      onChange={handleCodeChange}
    />
  );
};
