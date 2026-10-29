import { useEffect, useRef } from 'react';
import { useSelector } from '@xstate/react';
import type { AnyActorRef } from 'xstate';
import type { IssueSeverity } from '@taucad/runtime';
import type { CodeIssue } from '@taucad/types';
import { URI } from 'vscode-uri';
import type { EditorDocumentSession } from '#lib/editor-document-session.js';
import type { EditorDiagnostic } from '#lib/editor-diagnostics.js';

const kernelOwner = 'kernel';

type KernelIssue = Readonly<{
  message: string;
  location?: {
    fileName: string;
    startLineNumber: number;
    startColumn: number;
    endLineNumber?: number;
    endColumn?: number;
  };
  severity: IssueSeverity;
}>;

function offsetAt(text: string, line: number, column: number): number {
  let offset = 0;
  for (let current = 1; current < line && offset < text.length; current += 1) {
    const next = text.indexOf('\n', offset);
    if (next === -1) {
      return text.length;
    }
    offset = next + 1;
  }
  const end = text.indexOf('\n', offset);
  return Math.min(offset + Math.max(0, column - 1), end === -1 ? text.length : end);
}

function severityOf(value: IssueSeverity): EditorDiagnostic['severity'] {
  return value === 'warning' ? 'warning' : value === 'info' ? 'info' : 'error';
}

function positionAt(text: string, offset: number): { line: number; column: number } {
  const before = text.slice(0, Math.max(0, Math.min(offset, text.length)));
  const line = before.split('\n');
  return { line: line.length, column: (line.at(-1)?.length ?? 0) + 1 };
}

/** Keep diagnostics for every source file, including files with no mounted editor. */
export function useKernelDiagnostics(options: {
  cadActor: AnyActorRef | undefined;
  session: EditorDocumentSession | undefined;
}): void {
  const { cadActor, session } = options;
  const previousUris = useRef(new Set<string>());
  const issues = useSelector(cadActor, (state): Map<string, KernelIssue[]> => {
    return (state?.context.kernelIssues as Map<string, KernelIssue[]> | undefined) ?? new Map<string, KernelIssue[]>();
  });

  useEffect(() => {
    if (!session) {
      return;
    }
    let active = true;
    const current = new Set<string>();
    // Diagnostics materialize neutral text on demand, independently of a view.
    const load = async (): Promise<void> => {
      const byFile = new Map<string, KernelIssue[]>();
      for (const [entryPath, entries] of issues) {
        for (const issue of entries) {
          const path = issue.location?.fileName ?? entryPath;
          const list = byFile.get(path) ?? [];
          list.push(issue);
          byFile.set(path, list);
        }
      }
      await Promise.all(
        [...byFile].map(async ([path, entries]) => {
          const document = await session.getOrEnsureDocument(path);
          // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- cleanup can happen while materialization awaits.
          if (!active || !document) {
            return;
          }
          const diagnostics = entries.map((issue): EditorDiagnostic => {
            const { location } = issue;
            const from = location ? offsetAt(document.text, location.startLineNumber, location.startColumn) : 0;
            const to = location
              ? offsetAt(
                  document.text,
                  location.endLineNumber ?? location.startLineNumber,
                  location.endColumn ?? location.startColumn + 1,
                )
              : from;
            return {
              from,
              to: Math.max(from, to),
              message: issue.message,
              severity: severityOf(issue.severity),
              source: 'kernel',
            };
          });
          current.add(document.uri);
          session.diagnostics.set(document.uri, kernelOwner, diagnostics);
        }),
      );
      // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- cleanup can happen while materialization awaits.
      if (!active) {
        return;
      }
      for (const uri of previousUris.current) {
        if (!current.has(uri)) {
          session.diagnostics.set(uri, kernelOwner, []);
        }
      }
      previousUris.current = current;
    };
    void load();
    return () => {
      active = false;
    };
  }, [issues, session]);

  useEffect(() => {
    if (!session || !cadActor) {
      return;
    }
    const byUri = new Map<string, CodeIssue[]>();
    return session.diagnostics.subscribe((event) => {
      if (event.owner !== 'typescript') {
        return;
      }
      const uri = URI.parse(event.uri);
      const document = uri.scheme === 'file' ? session.get(uri.path.slice(1)) : undefined;
      if (document) {
        byUri.set(
          event.uri,
          event.diagnostics
            .filter((item) => item.severity === 'error')
            .map((item) => {
              const start = positionAt(document.text, item.from);
              const end = positionAt(document.text, item.to);
              return {
                message: item.message,
                startLineNumber: start.line,
                startColumn: start.column,
                endLineNumber: end.line,
                endColumn: end.column,
              };
            }),
        );
      } else {
        byUri.delete(event.uri);
      }
      cadActor.send({ type: 'setCodeIssues', errors: [...byUri.values()].flat() });
    });
  }, [cadActor, session]);
}
