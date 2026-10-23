/**
 * `pose_model` on the host (live-render blueprint LRP-7, decision D3): drive and read the mechanism of a model the
 * viewer shows.
 *
 * The server evaluates every pose itself, from the mechanism the shown GLB carries, with the solver the page's
 * Kinematics pane runs, so the agent reads the same coordinates with or without a page. It keeps the playback of each
 * shown model (a playing clip advances on the server's clock), and hands each command to the pages through
 * `app_sync`; a page then reports its own playback in `view_state`.
 */

import { readFile } from 'node:fs/promises';

import type { TauMcpViewerFailure } from '@taucad/mcp';
import type {
  TauViewerModel,
  TauViewerPlayback,
  TauViewerPoseCommand,
  TauViewerPoseInput,
  TauViewerPoseResult,
  TauViewerViewState,
} from '@taucad/mcp/viewer-protocol';
import { readModelMechanism, resolveModelPose } from '@taucad/agent-tools/runtime';

/** One shown model `pose_model` drives: a drawn file on disk, or a watched source's render held in memory. */
export type McpViewerPoseTarget = Readonly<
  { model: TauViewerModel } & ({ absolutePath: string } | { bytes: Uint8Array })
>;

/** What the poser needs from the live link to the pages. */
export type McpViewerPosePages = Readonly<{
  /** Hand a command to the pages of `scope`. */
  posed(command: Omit<TauViewerPoseCommand, 'sequence'>, scope: string | undefined): void;
  /** How many live pages of `scope` show a model. */
  viewers(modelId: string, scope: string | undefined): number;
  /** The freshest view a live page of `scope` reports for a model, if one shows it. */
  viewOf(modelId: string, scope: string | undefined): TauViewerViewState | undefined;
}>;

/** The poser of one server process. */
export type McpViewerPoser = Readonly<{
  pose(
    target: McpViewerPoseTarget,
    input: TauViewerPoseInput,
    scope: string | undefined,
  ): Promise<TauViewerPoseResult | TauMcpViewerFailure>;
}>;

/**
 * A model's playback, with the server clock time a playing clip's `time` was taken at, and the driver coordinates
 * set since; `drivers` is undefined while the clip decides the pose.
 */
type Playing = Readonly<{
  playback: TauViewerPlayback;
  at: number;
  drivers?: Readonly<Record<string, number>> | undefined;
}>;

const stopped: TauViewerPlayback = { status: 'stopped', time: 0, speed: 1 };

/** The most shown models whose playback the server keeps. */
const keptModels = 256;

/**
 * Create the poser of one `tau mcp` process.
 *
 * @param pages - The live link to the pages.
 * @param now - The clock, in milliseconds; tests replace it.
 * @returns The poser.
 */
export const createMcpViewerPoser = (pages: McpViewerPosePages, now: () => number = Date.now): McpViewerPoser => {
  const playing = new Map<string, Playing>();

  /** The playback now: a playing clip has advanced by the time since it was taken, at its speed. */
  const current = (state: Playing | undefined): TauViewerPlayback => {
    if (state === undefined) {
      return stopped;
    }
    const { playback } = state;
    return playback.status === 'playing'
      ? { ...playback, time: playback.time + ((now() - state.at) / 1000) * playback.speed }
      : playback;
  };

  const remember = (modelId: string, state: Playing): void => {
    playing.delete(modelId);
    playing.set(modelId, state);
    for (const key of playing.keys()) {
      if (playing.size <= keptModels) {
        break;
      }
      playing.delete(key);
    }
  };

  return {
    async pose(target, input, scope) {
      const { model } = target;
      if (model.mimeType !== 'model/gltf-binary') {
        return {
          errorCode: 'NO_MECHANISM',
          message: `${model.sourceFile ?? model.path} is a drawing; it has no mechanism.`,
        };
      }
      const bytes = 'bytes' in target ? target.bytes : new Uint8Array(await readFile(target.absolutePath));
      const mechanism = readModelMechanism(bytes);
      if (mechanism === undefined) {
        return {
          errorCode: 'NO_MECHANISM',
          message: `The shown ${model.sourceFile ?? model.path} carries no mechanism. Export one named mechanism from the source and show it again; evaluate_model reports its mechanism status.`,
        };
      }
      const animations = (mechanism.animations ?? []).map(({ id }) => id);
      const { animation, coordinates } = input;
      if (animation !== undefined && !animations.includes(animation.id)) {
        return {
          errorCode: 'UNKNOWN_ANIMATION',
          message: `This model's mechanism has no animation ${animation.id}; ${animations.length === 0 ? 'it declares no animation' : `it offers ${animations.join(', ')}`}.`,
        };
      }
      const previous = playing.get(model.id);
      const before = current(previous);
      const drivers = previous?.drivers;
      let next: Playing;
      if (animation !== undefined) {
        const sameClip = before.animationId === animation.id;
        const speed = animation.speed ?? before.speed;
        const time =
          animation.action === 'reset' ? 0 : animation.action === 'seek' ? animation.time! : sameClip ? before.time : 0;
        const status =
          animation.action === 'play'
            ? 'playing'
            : animation.action === 'pause'
              ? 'paused'
              : animation.action === 'reset'
                ? 'stopped'
                : before.status === 'playing' && sameClip
                  ? 'playing'
                  : 'paused';
        next = {
          playback: { status, animationId: animation.id, time, speed },
          at: now(),
          ...(animation.action === 'reset' ? { drivers: {} } : {}),
        };
      } else if (coordinates === undefined) {
        /* A read: a page the person drives reports the playback it runs; the server's own is the fallback. */
        const view = pages.viewOf(model.id, scope);
        if (view?.playback !== undefined && view.coordinates !== undefined) {
          return {
            model: { path: model.path, ...(model.sourceFile === undefined ? {} : { sourceFile: model.sourceFile }) },
            mechanism: { joints: Object.keys(mechanism.joints).length, animations },
            playback: view.playback,
            coordinates: view.coordinates,
            atLimit: [],
            viewers: pages.viewers(model.id, scope),
          };
        }
        next = { playback: before, at: now(), drivers };
      } else {
        /* Setting a joint stops a clip where it is, as dragging a slider in the Kinematics pane does. */
        next = {
          playback: { ...before, status: before.status === 'playing' ? 'paused' : before.status },
          at: now(),
          drivers: { ...drivers, ...coordinates },
        };
      }
      const { playback } = next;
      const outcome =
        next.drivers === undefined && playback.animationId !== undefined
          ? resolveModelPose(mechanism, { animation: { id: playback.animationId, time: playback.time } })
          : resolveModelPose(mechanism, { coordinates: next.drivers ?? {} });
      if (outcome.status === 'refused') {
        return { errorCode: 'UNKNOWN_COORDINATE', message: outcome.message };
      }
      remember(model.id, next);
      if (animation !== undefined || coordinates !== undefined) {
        pages.posed(
          {
            modelId: model.id,
            ...(animation === undefined
              ? {}
              : {
                  animation: { id: animation.id, action: animation.action, time: playback.time, speed: playback.speed },
                }),
            ...(coordinates === undefined ? {} : { coordinates }),
          },
          scope,
        );
      }
      return {
        model: { path: model.path, ...(model.sourceFile === undefined ? {} : { sourceFile: model.sourceFile }) },
        mechanism: { joints: Object.keys(mechanism.joints).length, animations },
        playback,
        coordinates: outcome.coordinates,
        atLimit: outcome.atLimit,
        viewers: pages.viewers(model.id, scope),
      };
    },
  };
};
