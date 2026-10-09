import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileCode, LoaderCircle, Send } from 'lucide-react';
import type {
  MachineAcceptedContainer,
  MachineArtifactReference,
  MachineClient,
  MachineDirectoryEntry,
  MachineJobCheck,
} from '@taucad/runtime/machine';
import { fileExtensions, mimeTypes } from '@taucad/types/constants';
import { Button } from '@taucad/ui/components/button';
import { sha256Bytes } from '@taucad/utils/hash';
import { randomUuid } from '@taucad/utils/id';
import { ParameterSelect } from '#components/geometry/parameters/parameter-select.js';
import { PrintSetupRow } from '#components/print/print-setup-row.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { operator } from '#hooks/use-machine-control.js';
import type { MachineControl } from '#hooks/use-machine-control.js';
import { useProject } from '#hooks/use-project.js';
import { PrintNotice, PrintRow, PrintStage } from '#routes/w.$workspace.$project/chat-print-section.js';
import {
  JobChecks,
  describePrintError,
  describeProgram,
  startBlocker,
} from '#routes/w.$workspace.$project/chat-print-send.js';

/**
 * The extensions a machine's accepted containers are saved under: each container's own `extensions`, or, for one that
 * declares none, the extensions Tau's file table gives its media type.
 *
 * @param accepts - What the machine accepts.
 * @returns Lower-case extensions without the dot.
 * @public
 */
export const programExtensions = (accepts: readonly MachineAcceptedContainer[]): readonly string[] => [
  ...new Set(
    accepts.flatMap(({ mediaType, extensions }): readonly string[] =>
      extensions === undefined
        ? fileExtensions.filter((extension) => mimeTypes[extension] === mediaType)
        : extensions.map((extension) => extension.slice(1)),
    ),
  ),
];

/** The container a file goes in: by its extension, the first a machine accepts. */
const containerFor = (
  path: string,
  accepts: readonly MachineAcceptedContainer[],
): MachineAcceptedContainer | undefined =>
  accepts.find((container) =>
    programExtensions([container]).some((extension) => path.toLowerCase().endsWith(`.${extension}`)),
  );

/** A program file as the project lists it: its size and time name its version. */
type ProgramFile = Readonly<{ path: string; size: number; mtimeMs: number }>;

/** At most this many files per extension; a project with more lists the first. */
const searchLimit = 200;

/**
 * The project's files a machine can run, from the project's own file index, kept current as files change.
 *
 * @param extensions - The extensions the machine takes.
 * @returns The files, sorted by path, or `undefined` while the first search runs.
 */
const useProgramFiles = (extensions: readonly string[]): readonly ProgramFile[] | undefined => {
  const { treeService } = useFileManager();
  const [found, setFound] = useState<readonly ProgramFile[]>();
  const extensionsKey = extensions.join(',');
  useEffect(() => {
    if (treeService === undefined) {
      return;
    }
    let isCurrent = true;
    const wanted = extensionsKey.split(',').filter(Boolean);
    const search = async (): Promise<void> => {
      const hits = await Promise.all(
        wanted.map(async (extension) => treeService.searchFiles(`.${extension}`, { maxResults: searchLimit })),
      );
      if (!isCurrent) {
        return;
      }
      const files = new Map<string, ProgramFile>();
      for (const hit of hits.flat()) {
        if (hit.type === 'file' && wanted.some((extension) => hit.path.toLowerCase().endsWith(`.${extension}`))) {
          files.set(hit.path, { path: hit.path, size: hit.size, mtimeMs: hit.mtimeMs });
        }
      }
      const next = [...files.values()].sort((left, right) => left.path.localeCompare(right.path));
      /* The same files keep the same list, so a change elsewhere in the project does not check the program again. */
      setFound((previous) => (JSON.stringify(previous) === JSON.stringify(next) ? previous : next));
    };
    const refresh = (): void => {
      const run = async (): Promise<void> => {
        try {
          await search();
        } catch (error) {
          console.error('[print] Could not list the program files.', error);
        }
      };
      // async-iife: listing -- a failed search keeps the last list and is logged; the next tree change searches again.
      void run();
    };
    refresh();
    const unsubscribe = treeService.subscribeTree(refresh);
    return () => {
      isCurrent = false;
      unsubscribe();
    };
  }, [extensionsKey, treeService]);
  return found;
};

/** How long the chosen file must stay chosen before the machine checks it. Milliseconds. */
const checkDelay = 300;

/**
 * Why the program cannot be asked for yet, in the person's words: no file, the machine not ready, the check still
 * running, refused or blocked.
 *
 * @param input - The machine, what it runs, the files found, the chosen one and the machine's check of it.
 * @returns The first reason, or nothing when the job can be asked for.
 */
const programBlocker = ({
  entry,
  extensions,
  programs,
  program,
  check,
}: Readonly<{
  entry: MachineDirectoryEntry;
  extensions: readonly string[];
  programs: readonly ProgramFile[] | undefined;
  program: ProgramFile | undefined;
  check: MachineJobCheck | undefined;
}>): string | undefined => {
  if (programs === undefined) {
    return 'Looking for program files…';
  }
  if (program === undefined) {
    return `No program files in this project. ${entry.name} runs ${extensions.map((extension) => `.${extension}`).join(', ')} files.`;
  }
  const machine = startBlocker(entry);
  if (machine !== undefined) {
    return machine;
  }
  if (check === undefined) {
    return `Checking ${program.path} with ${entry.name}…`;
  }
  if (check.status === 'refused') {
    return check.message;
  }
  const blocked = check.checks.find((item) => item.state === 'blocked');
  return check.status === 'ready'
    ? undefined
    : blocked === undefined
      ? `${entry.name} cannot take this job yet.`
      : [blocked.label, blocked.detail].filter((part) => part !== undefined).join(': ');
};

type Checked = Readonly<{ key: string; artifact?: MachineArtifactReference; check: MachineJobCheck }>;

/**
 * The machine's check of one program file, debounced, with the artifact reference it checked. A new file, a new
 * version of it or a change in the machine's state checks again; nothing is recorded on the host.
 *
 * @param input - The client, the machine, what it accepts and the chosen file.
 * @returns The latest check of exactly this file and machine state, or nothing while it runs.
 */
const useProgramCheck = ({
  client,
  entry,
  accepts,
  program,
}: Readonly<{
  client: MachineClient;
  entry: MachineDirectoryEntry;
  accepts: readonly MachineAcceptedContainer[];
  program: ProgramFile | undefined;
}>): Checked | undefined => {
  const { projectId } = useProject();
  const { readFile } = useFileManager();
  const { machineId } = entry;
  /* ponytail: the machine's own state stands for what its checks read (a homing changes it twice); the position,
   * which moves several times a second, does not re-check. */
  const machineKey = [machineId, entry.freshness, entry.snapshot.connection, entry.snapshot.state.status];
  const checkKey = JSON.stringify([program?.path, program?.size, program?.mtimeMs, ...machineKey]);
  const [checked, setChecked] = useState<Checked>();

  useEffect(() => {
    if (program === undefined) {
      return;
    }
    const abort = new AbortController();
    const refuse = (code: Extract<MachineJobCheck, { status: 'refused' }>['code'], message: string): void => {
      setChecked({ key: checkKey, check: { status: 'refused', code, message } });
    };
    const timer = globalThis.setTimeout(() => {
      const ask = async (): Promise<void> => {
        try {
          const container = containerFor(program.path, accepts);
          if (container === undefined) {
            refuse('MACHINE_JOB_ARTIFACT_INVALID', `${entry.name} does not accept ${program.path}.`);
            return;
          }
          const selectedMember = container.payloadSelection === 'single' ? program.path : container.requiredMembers[0];
          if (selectedMember === undefined) {
            refuse(
              'MACHINE_JOB_ARTIFACT_INVALID',
              `${entry.name} names no program inside a ${container.mediaType} file.`,
            );
            return;
          }
          const bytes = await readFile(program.path);
          // SAFETY: sha256Bytes returns the lowercase hex the digest brand describes.
          const digest = `sha256:${await sha256Bytes(bytes)}` as MachineArtifactReference['digest'];
          const artifact: MachineArtifactReference = {
            projectId,
            path: program.path,
            digest,
            length: bytes.byteLength,
            mediaType: container.mediaType,
            contract: container.contract,
            selectedMember,
          };
          /* An empty start form: the provider completes it from what the machine reports. */
          const check = await client.checkJob({ machineId, artifact, configuration: {}, signal: abort.signal });
          if (!abort.signal.aborted) {
            setChecked({ key: checkKey, artifact, check });
          }
        } catch (error) {
          if (!abort.signal.aborted) {
            refuse('MACHINE_PREPARATION_FAILED', describePrintError(error));
          }
        }
      };
      // async-iife: check -- the answer lands in state; another file or machine state aborts this one.
      void ask();
    }, checkDelay);
    return () => {
      globalThis.clearTimeout(timer);
      abort.abort();
    };
  }, [accepts, checkKey, client, entry.name, machineId, program, projectId, readFile]);

  return checked?.key === checkKey ? checked : undefined;
};

/**
 * Program: choose one of the project's files the machine accepts, let the machine check it and complete its start
 * form, then ask for the job. The job waits above the stages for the person's review, attestations and Start, as
 * a sliced print does; nothing is recorded until the person asks.
 *
 * @param properties - The person's machines client and the control remedies are sent through.
 * @returns The stage, or nothing for a machine that takes no jobs.
 * @public
 */
export function ProgramStage({
  client,
  control,
  isDefaultOpen,
}: {
  readonly client: MachineClient;
  readonly control: MachineControl;
  readonly isDefaultOpen: boolean;
}): React.JSX.Element | undefined {
  const { entry } = control;
  const { jobs } = entry.descriptor.capabilities;
  const accepts = useMemo(() => (jobs.type === 'supported' ? jobs.accepts : []), [jobs]);
  const extensions = useMemo(() => programExtensions(accepts), [accepts]);
  const programs = useProgramFiles(extensions);
  const [chosen, setChosen] = useState<string>();
  const program = programs?.find(({ path }) => path === chosen) ?? programs?.[0];
  const current = useProgramCheck({ client, entry, accepts, program });
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string>();
  const requestIdRef = useRef<Readonly<{ key: string; requestId: string }>>(undefined);
  const { machineId } = entry;

  const blocker = programBlocker({ entry, extensions, programs, program, check: current?.check });

  const send = useCallback(async (): Promise<void> => {
    if (blocker !== undefined || current?.artifact === undefined || current.check.status !== 'ready') {
      return;
    }
    const { artifact, check } = current;
    setIsSending(true);
    setSendError(undefined);
    try {
      const key = JSON.stringify([artifact.digest, machineId, check.configuration]);
      if (requestIdRef.current?.key !== key) {
        requestIdRef.current = { key, requestId: randomUuid() };
      }
      /* The job waits for the person's review above the stages, with the form the machine completed. */
      await client.requestJob({
        machineId,
        artifact,
        configuration: check.configuration,
        requestedBy: operator,
        program: { name: artifact.path.split('/').at(-1) ?? artifact.path },
        jobId: requestIdRef.current.requestId,
      });
    } catch (error) {
      setSendError(describePrintError(error));
    } finally {
      setIsSending(false);
    }
  }, [blocker, client, current, machineId]);

  if (jobs.type === 'unsupported') {
    return undefined;
  }
  const result = current?.check;
  const unmet = result === undefined || result.status === 'refused' ? [] : result.checks;
  return (
    <PrintStage icon={FileCode} title='Program' summary={program?.path} isDefaultOpen={isDefaultOpen}>
      <div className='-my-1.5 flex min-w-0 flex-col gap-1'>
        {programs === undefined || programs.length === 0 ? null : (
          <PrintSetupRow label='Program'>
            <ParameterSelect
              label='Program'
              value={program?.path ?? ''}
              groups={[{ options: programs.map(({ path }) => ({ value: path, label: path })) }]}
              onChange={setChosen}
            />
          </PrintSetupRow>
        )}
      </div>
      {result === undefined || result.status === 'refused' ? null : (
        <dl className='flex flex-col gap-0.5'>
          <PrintRow label='Summary'>{describeProgram(result.program) || result.program.name}</PrintRow>
        </dl>
      )}
      {jobs.delivery === 'streamed' ? (
        <p className='text-xs text-muted-foreground'>
          Keep this computer awake: Tau feeds the program for the whole run.
        </p>
      ) : null}
      {sendError === undefined ? null : <PrintNotice tone='error'>{sendError}</PrintNotice>}
      {unmet.some((check) => check.state !== 'passed') ? (
        <JobChecks control={control} checks={unmet.filter((check) => check.state !== 'passed')} />
      ) : null}
      <div className='flex min-w-0 flex-wrap items-center justify-end gap-2'>
        <Button
          type='button'
          size='sm'
          aria-describedby={blocker === undefined ? undefined : 'print-program-blocker'}
          disabled={blocker !== undefined || isSending}
          onClick={() => {
            void send();
          }}
        >
          {isSending ? (
            <LoaderCircle aria-hidden className='animate-spin motion-reduce:animate-none' />
          ) : (
            <Send aria-hidden />
          )}
          Review job
        </Button>
      </div>
      {blocker === undefined ? null : (
        <p id='print-program-blocker' className='text-xs text-muted-foreground'>
          {blocker}
        </p>
      )}
    </PrintStage>
  );
}
