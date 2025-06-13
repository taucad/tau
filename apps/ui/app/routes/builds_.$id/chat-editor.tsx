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
import { cadActor } from '~/routes/builds_.$id/cad-actor.js';
import { HammerAnimation } from '~/components/hammer-animation.js';

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
      void registerMonaco(monaco);
    }
  }, [monaco]);

  const handleValidate = useCallback(() => {
    const errors = monaco?.editor.getModelMarkers({});
    // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison -- monaco has import issues. This is safe.
    const filteredErrors = errors?.filter((error) => error.severity === 8);
    if (filteredErrors?.length) {
      // Send errors to the CAD actor
      cadActor.send({
        type: 'setCodeErrors',
        errors: filteredErrors.map((error) => ({
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
      cadActor.send({ type: 'setCodeErrors', errors: [] });
    }
  }, [monaco]);

  return (
    <CodeEditor
      loading={<HammerAnimation className="size-20 animate-spin stroke-1 text-primary ease-in-out" />}
      className={cn('bg-background', className)}
      defaultLanguage="typescript"
      value={code}
      onChange={handleCodeChange}
      onValidate={handleValidate}
    />
  );
});
