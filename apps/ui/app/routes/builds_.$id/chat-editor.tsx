import { CodeEditor } from '@/components/code-editor';
import { useBuild } from '@/hooks/use-build2';
import { LoaderPinwheel } from 'lucide-react';
import { useCallback, useEffect } from 'react';
import { useMonaco } from '@monaco-editor/react';
// TODO: find a better way to import Replicad types
// eslint-disable-next-line @nx/enforce-module-boundaries
import replicadTypes from '../../../../../node_modules/replicad/dist/replicad.d.ts?raw';
import { useConsole } from '@/hooks/use-console';
import './chat-config';

export const ChatEditor = () => {
  const { setCode, code } = useBuild();
  const { log } = useConsole({ defaultOrigin: { component: 'Editor' } });

  const monaco = useMonaco();

  useEffect(() => {
    if (monaco) {
      monaco.languages.typescript.typescriptDefaults.setEagerModelSync(true);
      monaco.languages.typescript.typescriptDefaults.setExtraLibs([
        {
          content: `declare module 'replicad' { ${replicadTypes} }`,
          filePath: 'replicad.d.ts',
        },
        {
          content: `
    import * as replicadAll from 'replicad';
    declare global {
    declare var replicad = replicadAll;
    }
  `,
        },
      ]);
    }
  }, [monaco]);

  const handleCodeChange = useCallback(
    (value?: string) => {
      if (value) {
        setCode(value);
      }
    },
    [setCode],
  );

  const handleValidate = useCallback(() => {
    const errors = monaco?.editor.getModelMarkers({});
    if (errors?.length) {
      for (const error of errors) {
        const lineInfo = `${error.startLineNumber.toString().padStart(2)}:${error.startColumn.toString().padEnd(2)}`;

        if (error.severity === 1) {
          log.warn(`${lineInfo}: ${error.message}`);
        } else {
          log.error(`${lineInfo}: ${error.message}`);
        }
      }
    }
  }, [monaco, log]);

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
        onValidate={handleValidate}
      />
    </>
  );
};
