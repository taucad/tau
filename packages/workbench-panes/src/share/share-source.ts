import type { ComponentType, ReactNode } from 'react';

/**
 * A decorative icon a share method draws in the method picker or on its primary button; the pane passes
 * `aria-hidden`, so a lucide icon or any SVG component that spreads its properties fits.
 *
 * @public
 */
export type ShareMethodIcon = ComponentType<Readonly<{ className?: string; 'aria-hidden'?: boolean }>>;

/**
 * How a link method's share is protected, as the person chose it in the pane.
 *
 * @public
 */
export type ShareLinkProtection =
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'password'; password: string; includePassword: boolean }>;

/**
 * What the pane hands a link method's `share` when the person asks for a link.
 *
 * @public
 */
export type ShareLinkRequest = Readonly<{
  /** The protection the person chose; always `none` for a method without `encryption`. */
  protection: ShareLinkProtection;
  /** The value of each of the method's `options`, by option id. */
  options: Readonly<Record<string, boolean>>;
  /** Aborted when the pane goes away or the person starts another share. */
  signal: AbortSignal;
}>;

/**
 * What a link method's `share` answers: the link, or the sentence that says why there is none. Either may carry one
 * warning the pane shows beside the result.
 *
 * @public
 */
export type ShareLinkOutcome =
  | Readonly<{ url: string; warning?: string | undefined }>
  | Readonly<{ error: string; warning?: string | undefined }>;

/**
 * The card at the top of a link method's body: what the link is and where the project goes.
 *
 * @public
 */
export type ShareLinkNotice = Readonly<{
  /** Drawn left of the title. */
  icon: ReactNode;
  title: string;
  text: string;
}>;

/**
 * One on/off choice a link method offers under its encryption choice.
 *
 * @public
 */
export type ShareLinkOption = Readonly<{
  /** Key in the request's `options`; also names the checkbox element (`portable-share-<id>`). */
  id: string;
  label: string;
}>;

/**
 * The state of a link method's body that a `useExtension` hook may read and change.
 *
 * @public
 */
export type ShareLinkContext = Readonly<{
  /** Whether a share or another operation of this body is running; the method picker is disabled meanwhile. */
  busy: boolean;
  setBusy: (busy: boolean) => void;
  /** Show, or with `undefined` clear, the body's error sentence. */
  setError: (message: string | undefined) => void;
  /** The link made in this body, once there is one. */
  shareUrl: string | undefined;
  setShareUrl: (url: string) => void;
  /** Forget the link, its warning and the error, so the body offers to make a new link. */
  reset: () => void;
  /** Move focus to the primary button. */
  focusPrimary: () => void;
}>;

/**
 * What a `useExtension` hook adds to a link method's body: an account connection to make before sharing, management of
 * what was shared, and the callouts that go with them.
 *
 * @public
 */
export type ShareLinkExtension = Readonly<{
  /** Shown when no operation of the body has failed. */
  error?: string | undefined;
  /** Drawn between the options and the error. */
  callouts?: ReactNode;
  /** Whether the primary button waits for something the extension is still checking. */
  isPending?: boolean;
  /**
   * Replaces the primary action: a label and what it does (the button keeps the body's icon and copy tick), or an
   * element drawn in the button's place.
   */
  primary?: Readonly<{ label: string; onActivate: () => void }> | Readonly<{ element: ReactNode }> | undefined;
  /** Drawn before the primary button. */
  actions?: ReactNode;
  /** Replaces the method's `share`, for an extension that keeps what it shared. */
  share?: ((request: ShareLinkRequest) => Promise<ShareLinkOutcome>) | undefined;
}>;

/**
 * Fields every share method has.
 *
 * @public
 */
export type ShareMethodBase = Readonly<{
  /** Stable id; the pane keeps one body per id. */
  id: string;
  /** Shown in the method picker. */
  label: string;
  icon: ShareMethodIcon;
}>;

/**
 * A method the pane draws itself: a notice, a password and other options, and a primary button that makes the link,
 * copies it and confirms the copy with a tick.
 *
 * @public
 */
export type ShareLinkMethod = ShareMethodBase &
  Readonly<{
    kind: 'link';
    /** Shown under the pane title while this method is chosen. */
    description: string;
    notice: ShareLinkNotice;
    /** Offer password encryption, with the password's UTF-8 byte bounds and the notice shown while it is on. */
    encryption?: Readonly<{
      minBytes: number;
      maxBytes: number;
      notice: Readonly<{ title: string; text: string }>;
    }>;
    options?: readonly ShareLinkOption[];
    /** The primary button before the link exists, for example `Copy direct link`. */
    action: Readonly<{ label: string; icon: ShareMethodIcon }>;
    /** Announced when the new link is copied. */
    copiedMessage: string;
    share: (request: ShareLinkRequest) => Promise<ShareLinkOutcome>;
    /**
     * A hook the body calls on every render, for a method that needs more than the link body draws. It runs once per
     * body: choosing another method and coming back starts a new one.
     */
    useExtension?: (context: ShareLinkContext) => ShareLinkExtension;
  }>;

/**
 * A method whose body its host draws, inside `SharePaneFrame` from `@taucad/workbench-panes/share/share-pane`.
 *
 * @public
 */
export type ShareCustomMethod = ShareMethodBase &
  Readonly<{
    kind: 'custom';
    /** Draws the whole body, including the frame (which carries the title, description and method picker). */
    render: () => ReactNode;
  }>;

/**
 * One way to share.
 *
 * @public
 */
export type ShareMethodSource = ShareLinkMethod | ShareCustomMethod;

/**
 * What the Share pane needs from its host beyond the shared units: the ways this host can share, and which one shows.
 * Each host (the Tau app, the agent plugin viewer) implements it over its own state. The method picker is shown only
 * when there is more than one method.
 *
 * @public
 */
export type ShareSource = Readonly<{
  /** The methods offered, in picker order. */
  methods: readonly ShareMethodSource[];
  /** The chosen method, when the host keeps the choice. A method not offered falls back to the first one. */
  method?: string | undefined;
  /** The method the pane opens on when the host does not keep the choice. */
  initialMethod?: string | undefined;
  /** Told when the person picks a method. */
  onMethodChange?: ((id: string) => void) | undefined;
  /** Announces a copied link; without it the button's tick is the only confirmation. */
  notify?: ((message: string) => void) | undefined;
}>;
