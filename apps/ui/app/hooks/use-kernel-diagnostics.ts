/**
 * Kernel Diagnostics Hook
 *
 * Subscribes to kernel issues from the CAD machine and pushes them as
 * Monaco markers through the MonacoMarkerService. Handles all files
 * (not just the active file) and clears stale markers when issues resolve.
 *
 * Also provides handleValidate callback for forwarding Monaco TS markers
 * to the CAD actor (Monaco-to-kernel direction).
 */

import { useCallback, useEffect, useRef } from 'react';
import { useSelector } from '@xstate/react';
import type * as Monaco from 'monaco-editor';
import type { AnyActorRef } from 'xstate';
import type { IssueSeverity, KernelStackFrame } from '@taucad/runtime';
import type { MonacoMarkerService } from '#lib/monaco-marker-service.js';

const kernelMarkerOwner = 'kernel';

/**
 * Map IssueSeverity to Monaco MarkerSeverity.
 */
function getMarkerSeverity(monaco: typeof Monaco, severity: IssueSeverity | undefined): Monaco.MarkerSeverity {
  switch (severity) {
    case 'warning': {
      return monaco.MarkerSeverity.Warning;
    }

    case 'info': {
      return monaco.MarkerSeverity.Info;
    }

    case 'error': {
      return monaco.MarkerSeverity.Error;
    }

    default: {
      return monaco.MarkerSeverity.Error;
    }
  }
}

/**
 * Build Monaco relatedInformation from kernel stack frames.
 * Includes user and library frames that have file/line info, skipping
 * the primary error frame (which is already the marker location).
 */
function buildRelatedInformation(
  monaco: typeof Monaco,
  stackFrames: KernelStackFrame[] | undefined,
): Monaco.editor.IRelatedInformation[] | undefined {
  if (!stackFrames || stackFrames.length === 0) {
    return undefined;
  }

  // Build related info from visible frames (user + library), skipping the first user frame
  // (it's the primary marker location). Include subsequent call sites and library frames.
  let skippedPrimary = false;
  const related: Monaco.editor.IRelatedInformation[] = [];

  for (const frame of stackFrames) {
    if (frame.context !== 'user' && frame.context !== 'library') {
      continue;
    }

    if (!frame.fileName || !frame.lineNumber) {
      continue;
    }

    // Skip the first user frame (it's already the marker location)
    if (!skippedPrimary && frame.context === 'user') {
      skippedPrimary = true;
      continue;
    }

    const functionLabel = frame.functionName ?? '<anonymous>';
    const isLibrary = frame.context === 'library';
    const message = isLibrary
      ? `${functionLabel} (${frame.fileName}:${frame.lineNumber})`
      : `called from ${functionLabel}`;

    // For user frames, resolve against Monaco's file:// URI scheme.
    // Library frames use their display path directly.
    const resource = isLibrary ? monaco.Uri.parse(`file:///${frame.fileName}`) : monaco.Uri.file(`/${frame.fileName}`);

    related.push({
      resource,
      message,
      startLineNumber: frame.lineNumber,
      startColumn: frame.columnNumber ?? 1,
      endLineNumber: frame.lineNumber,
      endColumn: frame.columnNumber ?? 1,
    });
  }

  return related.length > 0 ? related : undefined;
}

type UseKernelDiagnosticsOptions = {
  monaco: typeof Monaco | undefined;
  cadActor: AnyActorRef | undefined;
  markerService: MonacoMarkerService | undefined;
};

type KernelDiagnosticsIssue = {
  message: string;
  location?: {
    fileName: string;
    startLineNumber: number;
    startColumn: number;
    endLineNumber?: number;
    endColumn?: number;
  };
  stackFrames?: KernelStackFrame[];
  severity: IssueSeverity;
};

type UseKernelDiagnosticsReturn = {
  handleValidate: () => void;
};

/**
 * Hook to sync kernel diagnostics to/from Monaco markers.
 *
 * Kernel-to-Monaco: Subscribes to cadActor.context.kernelIssues for ALL files,
 * pushes markers through MarkerService.
 *
 * Monaco-to-Kernel: Reads Monaco TS markers and forwards errors to cadActor.
 */
export function useKernelDiagnostics(options: UseKernelDiagnosticsOptions): UseKernelDiagnosticsReturn {
  const { monaco, cadActor, markerService } = options;

  // Track previous set of files with issues to clear stale markers
  const previousFilesRef = useRef<Set<string>>(new Set());

  // Subscribe to ALL kernel issues (not just active file)
  const kernelIssues = useSelector(cadActor, (state): Map<string, KernelDiagnosticsIssue[]> => {
    const issues = state?.context.kernelIssues as Map<string, KernelDiagnosticsIssue[]> | undefined;
    return issues ?? new Map<string, KernelDiagnosticsIssue[]>();
  });

  // Sync kernel issues to Monaco markers via MarkerService
  useEffect(() => {
    if (!monaco || !markerService) {
      return;
    }

    const currentFiles = new Set<string>();

    // Set markers for all files with issues.
    // Issues may reference files different from the entry path (cross-file errors),
    // so we group by location.fileName to place markers on the correct file.
    for (const [filePath, issues] of kernelIssues) {
      // Group issues by their actual source file (from location.fileName),
      // falling back to the entry pathPath for issues without location.
      const issuesByFile = new Map<string, Monaco.editor.IMarkerData[]>();

      for (const issue of issues) {
        if (!issue.location) {
          continue;
        }

        const targetFile = issue.location.fileName;
        if (!issuesByFile.has(targetFile)) {
          issuesByFile.set(targetFile, []);
        }

        issuesByFile.get(targetFile)!.push({
          startLineNumber: issue.location.startLineNumber,
          startColumn: issue.location.startColumn,
          endLineNumber: issue.location.endLineNumber ?? issue.location.startLineNumber,
          endColumn: issue.location.endColumn ?? issue.location.startColumn + 1,
          message: issue.message,
          severity: getMarkerSeverity(monaco, issue.severity),
          source: 'kernel',
          relatedInformation: buildRelatedInformation(monaco, issue.stackFrames),
        });
      }

      // Apply markers to each target file
      for (const [targetFile, markers] of issuesByFile) {
        currentFiles.add(targetFile);
        const uri = monaco.Uri.file(`/${targetFile}`).toString();
        markerService.setMarkers(uri, kernelMarkerOwner, markers);
      }

      // If no issues had location, still track the entry path to clear stale markers
      if (issuesByFile.size === 0) {
        currentFiles.add(filePath);
      }
    }

    // Clear markers for files that no longer have issues
    for (const previousFile of previousFilesRef.current) {
      if (!currentFiles.has(previousFile)) {
        const uri = monaco.Uri.file(`/${previousFile}`).toString();
        markerService.clearMarkers(uri, kernelMarkerOwner);
      }
    }

    previousFilesRef.current = currentFiles;
  }, [monaco, markerService, kernelIssues, cadActor]);

  // Monaco-to-Kernel: forward TS error markers to CAD actor
  const handleValidate = useCallback(() => {
    if (!monaco || !cadActor) {
      return;
    }

    const errors = monaco.editor.getModelMarkers({});
    // oxlint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison -- monaco has import issues. This is safe.
    const filteredErrors = errors.filter((error) => error.severity === 8);

    if (filteredErrors.length > 0) {
      cadActor.send({
        type: 'setCodeIssues',
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
      cadActor.send({ type: 'setCodeIssues', errors: [] });
    }
  }, [monaco, cadActor]);

  return { handleValidate };
}
