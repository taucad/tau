/**
 * The app's binding of `@taucad/files-ui/utils/workspace-telemetry.utils`:
 * it injects PostHog analytics and UI error reporting (SB4) into the
 * library's workspace emitters.
 */

import { useMemo } from 'react';
import { createWorkspaceTelemetry } from '@taucad/files-ui/utils/workspace-telemetry.utils';
import type { WorkspaceFailureReporter, WorkspaceTelemetry } from '@taucad/files-ui/utils/workspace-telemetry.utils';
import { useAnalytics } from '#hooks/use-analytics.js';
import type { Analytics } from '#hooks/use-analytics.js';
import { reportUiError } from '#lib/error-reporting.js';

const reportWorkspaceFailure: WorkspaceFailureReporter = (error, details) => {
  // async-iife: bootstrap -- telemetry callers do not await; reporting never rejects.
  void reportUiError(error, details);
};

export const buildWorkspaceTelemetry = (analytics: Analytics): WorkspaceTelemetry =>
  createWorkspaceTelemetry({ analytics, reportFailure: reportWorkspaceFailure });

export const useWorkspaceTelemetry = (): WorkspaceTelemetry => {
  const analytics = useAnalytics();
  return useMemo(() => buildWorkspaceTelemetry(analytics), [analytics]);
};
