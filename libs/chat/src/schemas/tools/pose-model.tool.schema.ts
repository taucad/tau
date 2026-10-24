import { z } from 'zod';

/** What `pose_model` does to an animation. @public */
export const poseModelAnimationActions = ['play', 'pause', 'seek', 'reset'] as const;

const animationIdSchema = z.string().min(1).max(128);

/*
 * Driver coordinates keyed by degree-of-freedom id. A record serializes its key as `propertyNames`, which some
 * providers refuse; piping a typeless input side into it keeps the check while the wire form is the description.
 */
/** @public */
export const poseModelCoordinatesSchema = z
  .any()
  .describe(
    'Driver coordinates to set, keyed by degree-of-freedom id, in the mechanism units: degrees for a revolute joint, metres for a prismatic one, e.g. {"sun": 90}. A driver left out keeps its value.',
  )
  .pipe(z.record(z.string().min(1).max(256), z.number()));

/**
 * A pose to capture without a viewer page: an animation sampled at a time, or driver coordinates. @public
 */
export const capturePoseSchema = z
  .union([
    z.strictObject({
      animation: z.strictObject({
        id: animationIdSchema.describe('An animation id from evaluate_model mechanism.animations.'),
        time: z.number().nonnegative().describe('Seconds into the animation.'),
      }),
    }),
    z.strictObject({ coordinates: poseModelCoordinatesSchema }),
  ])
  .describe("Pose the model's mechanism before capturing: an animation at a time, or driver coordinates.");
/** @public */
export type CapturePose = z.infer<typeof capturePoseSchema>;

/** One poseable mechanism, as the shown GLB carries it. @public */
export const poseModelMechanismSchema = z.strictObject({
  joints: z.number().int().nonnegative(),
  animations: z.array(animationIdSchema).describe('Animation ids pose_model takes.'),
});

/** The viewer's playback of one model, as its Kinematics pane runs it. @public */
export const poseModelPlaybackSchema = z.strictObject({
  status: z.enum(['stopped', 'playing', 'paused']),
  animationId: animationIdSchema.optional().describe('The selected animation; absent for none.'),
  time: z.number().nonnegative().describe('Seconds into the animation.'),
  speed: z.number().positive().describe('Playback rate; 1 is real time.'),
});
/** @public */
export type PoseModelPlayback = z.infer<typeof poseModelPlaybackSchema>;

/**
 * Input of `pose_model`: drive the mechanism of the model the Tau viewer shows. Send `animation`, `coordinates`, or
 * neither to read the pose.
 * @public
 */
export const poseModelInputSchema = z
  .strictObject({
    targetFile: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Project-relative CAD source to pose; it is shown first when the viewer shows another model. Omit for the model shown.',
      ),
    animation: z
      .strictObject({
        id: animationIdSchema.describe('An animation id from show_model or evaluate_model mechanism.animations.'),
        action: z
          .enum(poseModelAnimationActions)
          .describe('play from the current time, pause, seek to time, or reset to the as-built pose.'),
        time: z.number().nonnegative().optional().describe('Seconds into the animation; required for seek.'),
        speed: z
          .number()
          .positive()
          .max(16)
          .optional()
          .describe('Playback rate; 1 is real time. Defaults to the current rate.'),
      })
      .optional(),
    coordinates: poseModelCoordinatesSchema.optional(),
  })
  .refine((input) => input.animation?.action !== 'seek' || input.animation.time !== undefined, {
    path: ['animation', 'time'],
    message: 'seek needs time, in seconds into the animation.',
  })
  .refine((input) => input.animation === undefined || input.coordinates === undefined, {
    path: ['coordinates'],
    message: 'Send animation or coordinates, not both: an animation sets the coordinates it drives.',
  });
/** @public */
export type PoseModelInput = z.infer<typeof poseModelInputSchema>;

/** Output of `pose_model`. @public */
export const poseModelOutputSchema = z.strictObject({
  model: z.strictObject({ path: z.string(), sourceFile: z.string().optional() }),
  mechanism: poseModelMechanismSchema,
  playback: poseModelPlaybackSchema,
  coordinates: z
    .record(z.string(), z.number())
    .describe('Every degree of freedom at the pose, drivers and coupled followers, in mechanism units.'),
  atLimit: z.array(z.string()).describe('Degrees of freedom clamped to, or outside, their limits.'),
  viewers: z.number().int().nonnegative().describe('Open viewer pages that apply the pose.'),
});
/** @public */
export type PoseModelOutput = z.infer<typeof poseModelOutputSchema>;

/** Provider-facing description (≤150 words, host-neutral; context-engineering-policy:290). @public */
export const poseModelDescription = `Drive and read the motion of the model the Tau viewer shows, through the mechanism its source exports.

Send animation { id, action } to play, pause, seek (with time in seconds) or reset an authored animation, or coordinates to set driver joints; send neither to read the pose. Every open viewer page applies it, and view_state reports the page's playback and coordinates afterwards.

Returns the mechanism's joints and animation ids, the playback, every coordinate at the pose (drivers and coupled followers, in mechanism units) and those at a limit. A play reports the pose where it starts. A model whose GLB carries no mechanism is refused; evaluate_model reports why. To capture a pose without a viewer, pass pose to screenshot.`;
