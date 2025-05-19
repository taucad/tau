import { LoaderPinwheel } from 'lucide-react';
import { memo, useCallback, useEffect } from 'react';
import type { ComponentProps } from 'react';
import { useMonaco } from '@monaco-editor/react';
import { useSelector } from '@xstate/react';
// eslint-disable-next-line no-restricted-imports -- replicad types are not in the monorepo
import replicadTypes from '../../../../../node_modules/replicad/dist/replicad.d.ts?raw';
// eslint-disable-next-line import-x/no-unassigned-import -- setting up the Monaco editor web workers
import '~/routes/builds_.$id/chat-config.js';
import { CodeEditor } from '~/components/code-editor.js';
import { cn } from '~/utils/ui.js';
import { CopyButton } from '~/components/copy-button.js';
import { DownloadButton } from '~/components/download-button.js';
import { cadActor } from '~/routes/builds_.$id/cad-actor.js';

export const ChatEditor = memo(function ({ className }: { readonly className?: string }) {
  const monaco = useMonaco();
  const code = useSelector(cadActor, (state) => state.context.code);

  const handleCodeChange = useCallback((value: ComponentProps<typeof CodeEditor>['value']) => {
    if (value) {
      cadActor.send({ type: 'setCode', code: value });
    }
  }, []);

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

  const handleValidate = useCallback(() => {
    const errors = monaco?.editor.getModelMarkers({});
    if (errors?.length) {
      // Send errors to the CAD actor
      cadActor.send({
        type: 'setMonacoErrors',
        errors: errors.map((error) => ({
          startLineNumber: error.startLineNumber,
          startColumn: error.startColumn,
          message: error.message,
          severity: error.severity,
          endLineNumber: error.endLineNumber,
          endColumn: error.endColumn,
        })),
      });
    } else {
      // Clear errors when there are none
      cadActor.send({ type: 'setMonacoErrors', errors: [] });
    }
  }, [monaco]);

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
