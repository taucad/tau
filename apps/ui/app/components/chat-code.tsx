import { CopyButton } from './copy-button';
import { DownloadButton } from './download-button';
import { EditableCodeViewer } from './editable-code-viewer';
import { useReplicadCode } from './geometry/kernel/replicad/use-replicad-code';

export const ChatCode = () => {
  const { code, setCode } = useReplicadCode();

  return (
    <>
      <div className="flex flex-row justify-between items-center top-0 right-0 absolute my-1.5 mr-12 gap-1.5">
        <CopyButton variant="outline" size="icon" text={code} className="text-muted-foreground" />
        <DownloadButton variant="outline" size="icon" text={code} className="text-muted-foreground" />
      </div>
      <div className="bg-neutral-100 rounded-md m-2 mt-14 overflow-y-scroll w-full">
        <EditableCodeViewer className="text-xs" language="typescript" code={code} onChange={setCode} />
      </div>
    </>
  );
};
