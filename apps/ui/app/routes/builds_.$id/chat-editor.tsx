import { LoaderPinwheel } from 'lucide-react';
import { memo, useCallback, useEffect } from 'react';
import { useMonaco } from '@monaco-editor/react';
import replicadTypes from '../../../../../node_modules/replicad/dist/replicad.d.ts?raw';
// eslint-disable-next-line import-x/no-unassigned-import -- setting up the Monaco editor web workers
import './chat-config.js';
import { useBuild } from '@/hooks/use-build2.js';
import { CodeEditor } from '@/components/code-editor.js';
import { useConsole } from '@/hooks/use-console.js';
import { cn } from '@/utils/ui.js';
import { CopyButton } from '@/components/copy-button.js';
import { DownloadButton } from '@/components/download-button.js';

export const ChatEditor = memo(function ({ className }: { readonly className?: string }) {
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
      <div className="absolute top-0 right-0 z-10 my-2 mr-12 flex flex-row items-center justify-between gap-2 group-data-[view-mode=split]/chat-layout:mr-52 md:mr-22 md:group-data-[view-mode=split]/chat-layout:mr-62">
        <CopyButton
          variant="overlay"
          size="icon"
          getText={() => code}
          className="text-muted-foreground"
          tooltip="Copy code"
        />
        <DownloadButton
          variant="overlay"
          size="icon"
          title="main.ts"
          getBlob={async () =>
            new Promise((resolve) => {
              const blob = new Blob([code], { type: 'text/plain' });
              resolve(blob);
            })
          }
          className="text-muted-foreground"
          tooltip="Download code"
        />
      </div>
      <CodeEditor
        // Modify the key to force re-render when loading state changes to update the default value. Slightly hacky, but it's the most efficient way to do it.
        key={isLoading ? 'loading' : 'ready'}
        loading={<LoaderPinwheel className="size-20 animate-spin stroke-1 text-primary ease-in-out" />}
        className={cn('bg-background text-xs', className)}
        defaultLanguage="typescript"
        value={code}
        onChange={handleCodeChange}
        onValidate={handleValidate}
      />
    </>
  );
});
