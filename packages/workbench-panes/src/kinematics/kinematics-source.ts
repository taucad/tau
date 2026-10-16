/**
 * What the host knows about one entry's build that the viewer's kinematics actor does not.
 *
 * @public
 */
export type KinematicsUnitStatus = Readonly<{
  /** Whether a build of the entry is running; joints still show the previous render meanwhile. */
  isUpdating: boolean;
  /** Why the kernel rejected the entry's mechanism, when it did. */
  mechanismIssue: Readonly<{ message: string }> | undefined;
}>;

/**
 * A request to show the joint that moves a part, as the part menu's "Show kinematics" makes it.
 *
 * @public
 */
export type KinematicsRevealRequest = Readonly<{
  /** The entry whose model holds the part. */
  entryPath: string;
  /** The part's component id. */
  componentId: string;
}>;

/**
 * What the Kinematics pane needs from its host beyond the shared units. Each host (the Tau app, the agent plugin viewer)
 * implements it over its own state. Pose, playback, drag and the mechanism itself come from each unit's graphics actor,
 * so a host with none of these optional pieces still gets the whole pane.
 *
 * @public
 */
export type KinematicsSource = Readonly<{
  /**
   * Whether the pane is on screen. A hook: it is called during render. While hidden, the pane disarms viewer drags and
   * releases its unit claims. Absent, the pane counts as shown while mounted.
   */
  useIsShown?: () => boolean;
  /**
   * Subscribes to reveal requests: the pane clears its filter, opens the groups around the part's joint and focuses it.
   *
   * @returns Unsubscribes.
   */
  subscribeReveal?: (listener: (request: KinematicsRevealRequest) => void) => () => void;
  /**
   * The entry's build status. A hook: it is called during render, once per listed entry. Absent, an entry is never
   * updating and has no mechanism issue.
   */
  useUnitStatus?: (entryPath: string) => KinematicsUnitStatus;
}>;
