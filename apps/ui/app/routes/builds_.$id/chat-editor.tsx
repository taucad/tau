import { LoaderPinwheel } from 'lucide-react';
import { useCallback, useEffect } from 'react';
import { useMonaco } from '@monaco-editor/react';
import replicadTypes from '../../../../../node_modules/replicad/dist/replicad.d.ts?raw';
// eslint-disable-next-line import-x/no-unassigned-import -- setting up the Monaco editor web workers
import './chat-config.js';
import { useBuild } from '@/hooks/use-build2.js';
import { CodeEditor } from '@/components/code-editor.js';
import { useConsole } from '@/hooks/use-console.js';
import { cn } from '@/utils/ui.js';

export function ChatEditor({ className }: { readonly className?: string }) {
  const { setCode, code, isLoading } = useBuild();
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

        // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison -- unable to use MarkerSeverity due to monaco-editor using CJS
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
      {/* <div className="flex flex-row justify-between items-center top-0 right-0 absolute my-2 mr-22 gap-2">
        <CopyButton variant="overlay" size="icon" text={code} className="text-muted-foreground" tooltip="Copy code" />
        <DownloadButton
          variant="overlay"
          size="icon"
          title={`${name}.ts`}
          getBlob={() =>
            new Promise((resolve) => {
              const blob = new Blob([code], { type: 'text/plain' });
              resolve(blob);
            })
          }
          className="text-muted-foreground"
          tooltip="Download code"
        />
      </div> */}
      <CodeEditor
        // Modify the key to force re-render when loading state changes to update the default value. Slightly hacky, but it's the most efficient way to do it.
        key={isLoading ? 'loading' : 'ready'}
        loading={<LoaderPinwheel className="size-20 animate-spin stroke-1 text-primary ease-in-out" />}
        className={cn('bg-background text-xs', className)}
        defaultLanguage="typescript"
        defaultValue={code}
        onChange={handleCodeChange}
        onValidate={handleValidate}
      />
    </>
  );
}
