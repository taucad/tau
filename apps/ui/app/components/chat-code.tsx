import { CopyButton } from './copy-button';
import { DownloadButton } from './download-button';
import { EditableCodeViewer } from './editable-code-viewer';
import { useReplicad } from './geometry/kernel/replicad/replicad-context';

export const ChatCode = () => {
  const { code, setCode } = useReplicad();

  return (
    <>
      <div className="flex flex-row justify-between items-center top-0 right-0 absolute my-1.5 mr-12 gap-1.5">
        <CopyButton variant="outline" size="icon" text={code} className="text-muted-foreground" />
        <DownloadButton variant="outline" size="icon" text={code} className="text-muted-foreground" />
      </div>
      <div className="bg-neutral/10 rounded-md m-2 mt-14 overflow-y-scroll w-full">
        <EditableCodeViewer className="text-xs" language="typescript" code={code} onChange={setCode} />
      </div>
    </>
  );
};
