import { useCallback, useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { Textarea } from '@taucad/ui/components/textarea';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@taucad/ui/components/sheet';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useProject } from '#hooks/use-project.js';
import { readCanonicalProjectInstructions, projectInstructionsMaxBytes } from '#hooks/use-context-payload.js';
import { PaneButton } from '@taucad/workbench-panes/components/pane-button';

const instructionsPath = '.tau/AGENTS.md';
type LoadedInstructions = Readonly<{ bytes?: Uint8Array<ArrayBuffer> }>;
const decoder = new TextDecoder();
const encoder = new TextEncoder();

/** Project-authored instructions use the existing filesystem and context owner. */
export function ProjectInstructions(): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const { projectId } = useProject();
  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <PaneButton aria-label='Project instructions' tooltip='Project instructions'>
          <FileText aria-hidden />
        </PaneButton>
      </SheetTrigger>
      <SheetContent className='overflow-y-auto'>
        <SheetHeader>
          <SheetTitle>Project instructions</SheetTitle>
          <SheetDescription>Instructions shared by this project’s chats and child tasks.</SheetDescription>
        </SheetHeader>
        {isOpen ? <ProjectInstructionsEditor key={projectId} /> : null}
      </SheetContent>
    </Sheet>
  );
}

/** Editing remains local until the filesystem acknowledges Save instructions. */
export function ProjectInstructionsEditor(): React.JSX.Element {
  const { projectId } = useProject();
  return <InstructionsEditor key={projectId} projectId={projectId} />;
}

function InstructionsEditor({ projectId }: { readonly projectId: string }): React.JSX.Element {
  const { recordFiles, parameterFiles, workbenchFiles } = useFileManager();
  const canonicalPath = `/projects/${projectId}/${instructionsPath}`;
  const [text, setText] = useState('');
  const [saved, setSaved] = useState<LoadedInstructions>();
  const savedText = saved === undefined ? undefined : decoder.decode(saved.bytes);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  const read = useCallback(
    async (): Promise<LoadedInstructions> => readCanonicalProjectInstructions(projectId, recordFiles),
    [projectId, recordFiles],
  );

  const load = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(undefined);
    try {
      const value = await read();
      setText(decoder.decode(value.bytes));
      setSaved(value);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not read project instructions. Try loading them again.');
    } finally {
      setIsLoading(false);
    }
  }, [read]);

  useEffect(() => {
    let isCancelled = false;
    const initialize = async (): Promise<void> => {
      try {
        const value = await read();
        if (!isCancelled) {
          setText(decoder.decode(value.bytes));
          setSaved(value);
        }
      } catch (error) {
        if (!isCancelled) {
          setError(
            error instanceof Error ? error.message : 'Could not read project instructions. Try loading them again.',
          );
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };
    // async-iife: bootstrap — The mounted editor owns this bounded read and ignores settlement after close.
    void initialize();
    return () => {
      isCancelled = true;
    };
  }, [read]);

  const save = useCallback(async (): Promise<void> => {
    setIsSaving(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const bytes = encoder.encode(text);
      if (bytes.byteLength > projectInstructionsMaxBytes) {
        throw new Error(
          'Project instructions are too large to save here. Shorten them or edit .tau/AGENTS.md in Files.',
        );
      }
      await parameterFiles.mkdir(`/projects/${projectId}/.tau`, { recursive: true });
      const result = await workbenchFiles.writeFileChecked({
        path: canonicalPath,
        data: bytes,
        // oxlint-disable-next-line typescript/no-restricted-types -- The checked filesystem write uses null for expected absence.
        preconditions: [{ path: canonicalPath, expected: saved?.bytes ?? null }],
      });
      if (result.status === 'conflict') {
        throw new Error('Project instructions changed elsewhere. Load instructions again before saving.');
      }
      setSaved({ bytes });
      setNotice('Instructions saved. The next turn uses the updated instructions.');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save project instructions. Try saving again.');
    } finally {
      setIsSaving(false);
    }
  }, [canonicalPath, parameterFiles, projectId, saved, text, workbenchFiles]);

  return (
    <div className='flex min-w-0 flex-col gap-3 p-4'>
      <label htmlFor='project-instructions' className='text-sm font-medium'>
        Instructions
      </label>
      <Textarea
        id='project-instructions'
        value={text}
        disabled={isLoading || savedText === undefined}
        className='min-h-48'
        onChange={(event) => {
          setText(event.target.value);
          setNotice(undefined);
        }}
      />
      <p className='text-xs text-muted-foreground'>
        Saved in .tau/AGENTS.md. Add project goals, constraints, and paths to reference files. Manage those files in
        Files; references are available to agents to read when needed.
      </p>
      <div className='flex flex-wrap items-center gap-2'>
        <Button
          size='sm'
          disabled={isLoading || isSaving || savedText === undefined || text === savedText}
          aria-busy={isSaving}
          onClick={() => {
            void save();
          }}
        >
          Save instructions
        </Button>
        <Button
          size='sm'
          variant='outline'
          disabled={isLoading || isSaving}
          onClick={() => {
            void load();
          }}
        >
          Load instructions again
        </Button>
      </div>
      {isLoading ? (
        <p role='status' aria-busy className='text-sm'>
          Loading instructions…
        </p>
      ) : null}
      {error ? (
        <p role='alert' className='text-sm'>
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role='status' className='text-sm'>
          {notice}
        </p>
      ) : null}
    </div>
  );
}
