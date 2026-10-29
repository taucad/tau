import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';
import { useSession } from '@better-auth-ui/react';
import { authClient } from '#lib/auth-client.js';
import { ENV } from '#environment.config.js';
import { recordApiRequestId } from '#lib/api-request-id.js';

/** The agent-observability processing purposes, in the order the settings show them. */
export const telemetryPurposes = ['summary', 'content', 'diagnosis', 'reuse', 'training'] as const;

/** One processing purpose. */
export type TelemetryPurpose = (typeof telemetryPurposes)[number];

/** The effective state of one purpose, exactly as the server resolved it. */
export type TelemetryPurposeState = {
  purpose: TelemetryPurpose;
  allowed: boolean;
  decided: boolean;
  granted: boolean;
  refusal?: string;
};

/** The whole effective answer for the signed-in account. */
export type EffectiveTelemetryPurposes = {
  epoch: string;
  /** Absent while no approved notice is in force, which is when nothing can be decided. */
  noticeVersion?: string;
  projectId?: string;
  purposes: TelemetryPurposeState[];
};

/** The query key root, so a sign-out can drop every subject's answer at once. */
export const telemetryPurposesQueryKey = ['telemetry-purposes'] as const;

const subjectKey = (userId: string, projectId: string | undefined): readonly unknown[] => [
  ...telemetryPurposesQueryKey,
  userId,
  projectId ?? null,
];

const request = async (path: string, init: RequestInit): Promise<EffectiveTelemetryPurposes> => {
  const response = await fetch(`${ENV.TAU_API_URL}/v1/telemetry-purposes${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });

  if (!response.ok) {
    throw recordApiRequestId(new Error(`Failed to read agent-observability purposes: ${response.status}`), response);
  }

  return (await response.json()) as EffectiveTelemetryPurposes;
};

type UseTelemetryPurposesReturn = {
  /** The server's answer, or `undefined` while it is unknown. Never a local default. */
  effective: EffectiveTelemetryPurposes | undefined;
  /** Whether a purpose is permitted. Unknown is not permitted. */
  isAllowed: (purpose: TelemetryPurpose) => boolean;
  /** The state to display, which is a refusal for every purpose until the server answers. */
  stateOf: (purpose: TelemetryPurpose) => TelemetryPurposeState;
  /** False while no approved notice is in force, which is when no decision can be taken. */
  canDecide: boolean;
  isLoading: boolean;
  error: unknown;
  decide: UseMutationResult<
    EffectiveTelemetryPurposes,
    unknown,
    Readonly<{ purpose: TelemetryPurpose; granted: boolean }>
  >['mutate'];
  isDeciding: boolean;
};

const unknownState = (purpose: TelemetryPurpose): TelemetryPurposeState => ({
  purpose,
  allowed: false,
  decided: false,
  granted: false,
  refusal: 'no-decision',
});

/**
 * Read and decide the agent-observability processing purposes for the signed-in
 * account.
 *
 * The answer is cached per principal and project, never globally: an account
 * switch asks again rather than showing the previous account's grants, and a
 * sign-out drops every cached answer. Nothing here infers a permission from a
 * missing field — an unknown purpose is a refused purpose.
 *
 * @param options - `projectId` scopes the question to one project.
 * @returns The effective state, the decision mutation and their query state.
 */
export function useTelemetryPurposes(options: Readonly<{ projectId?: string }> = {}): UseTelemetryPurposesReturn {
  const queryClient = useQueryClient();
  const { data: session } = useSession(authClient);
  const userId = session?.user.id;
  const { projectId } = options;

  /* A sign-out or an account switch invalidates every subject's answer. A
   * response already in flight for the previous principal lands under that
   * principal's key, which this has just dropped, so it is never displayed. */
  useEffect(() => {
    if (userId === undefined) {
      queryClient.removeQueries({ queryKey: telemetryPurposesQueryKey });
    }
  }, [queryClient, userId]);

  const queryKey = subjectKey(userId ?? '', projectId);
  const {
    data: effective,
    isLoading,
    error,
  } = useQuery({
    queryKey,
    queryFn: async () =>
      request(projectId === undefined ? '' : `?projectId=${encodeURIComponent(projectId)}`, { method: 'GET' }),
    enabled: userId !== undefined,
    retry: 1,
    retryDelay: 1000,
  });

  const mutation = useMutation({
    mutationKey: [...queryKey, 'decide'],
    mutationFn: async (decision: Readonly<{ purpose: TelemetryPurpose; granted: boolean }>) => {
      const noticeVersion = effective?.noticeVersion;
      if (noticeVersion === undefined) {
        throw new Error('No agent-observability notice is in force, so no purpose can be decided.');
      }
      return request('', {
        method: 'PUT',
        body: JSON.stringify({ noticeVersion, decisions: [decision] }),
      });
    },
    async onSettled() {
      // The PUT answers for the account alone, and a refusal (such as a stale notice) leaves the cached
      // answer stale too; refetch either way so the key shows the server's current answer.
      await queryClient.invalidateQueries({ queryKey });
    },
  });

  const stateOf = (purpose: TelemetryPurpose): TelemetryPurposeState =>
    effective?.purposes.find((state) => state.purpose === purpose) ?? unknownState(purpose);

  return {
    effective,
    isAllowed: (purpose) => stateOf(purpose).allowed,
    stateOf,
    canDecide: typeof effective?.noticeVersion === 'string',
    isLoading,
    error,
    decide: mutation.mutate,
    isDeciding: mutation.isPending,
  };
}
