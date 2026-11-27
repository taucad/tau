import { createContext, useCallback, useContext, useId, useMemo, useState } from 'react';
import type { ReactNode, Ref } from 'react';
import { Heading } from '@taucad/ui/components/heading';
import { useWorkbenchPanesHost } from '#host/workbench-host.jsx';
import { ShareLinkBody } from '#share/share-link-body.jsx';
import { ShareMethodPicker } from '#share/share-method-picker.jsx';
import type { ShareMethodSource, ShareSource } from '#share/share-source.js';

type ShareFrameBinding = Readonly<{
  methods: readonly ShareMethodSource[];
  method: ShareMethodSource;
  onMethodChange: (id: string) => void;
  /** The host's sections, drawn after the method's inside the one scroll area. */
  extraSections: ReactNode;
}>;

const ShareFrameContext = createContext<ShareFrameBinding | undefined>(undefined);

/**
 * Properties of {@link SharePaneFrame}.
 *
 * @public
 */
export type SharePaneFrameProperties = Readonly<{
  /**
   * @deprecated The frame no longer carries state text: each state says what it is in its own section, and the
   * method's `description` sits under the picker. Ignored; it will be removed.
   */
  description?: string;
  /** Disables the method picker, for a body that is busy. */
  isDisabled?: boolean;
  /** The chosen method's sections: one or more {@link SharePaneSection}. */
  children: ReactNode;
}>;

/**
 * The Share pane's frame: one scroll area holding the method picker, the chosen method's sections and the host's
 * sections, in that order. Nothing in it is pinned and nothing inside it scrolls on its own. A link method's body is
 * framed by the pane; a custom method's `render` draws this frame around its own sections.
 *
 * @param props - Whether the picker is disabled, and the method's sections.
 * @returns The pane's region and its scroll area.
 * @public
 */
export function SharePaneFrame({ isDisabled = false, children }: SharePaneFrameProperties): React.JSX.Element {
  const binding = useContext(ShareFrameContext);
  if (binding === undefined) {
    throw new Error('SharePaneFrame rendered outside SharePane.');
  }
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      data-slot='share-pane'
      className='flex size-full min-h-0 min-w-0 flex-col bg-background'
    >
      <div
        data-slot='share-pane-scroll'
        className='min-h-0 min-w-0 flex-1 scroll-shadows-y overflow-y-auto [--scroll-fade-end:transparent] [--scroll-fade-size:28px]'
      >
        <Heading level={2} variant='label' id={titleId} data-slot='share-pane-title' className='sr-only'>
          Share project
        </Heading>
        <div data-slot='share-method' className='p-4'>
          <ShareMethodPicker
            methods={binding.methods}
            value={binding.method}
            isDisabled={isDisabled}
            onChange={binding.onMethodChange}
          />
        </div>
        {children}
        {binding.extraSections}
      </div>
    </section>
  );
}

/**
 * Properties of {@link SharePaneSection}.
 *
 * @public
 */
export type SharePaneSectionProperties = Readonly<{
  /** The section's heading; a titled section is a region named by it. */
  title?: string;
  /** One muted line under the heading. */
  description?: ReactNode;
  /** Receives the heading, so a section can move focus to it when the control that had focus goes away. */
  headingRef?: Ref<HTMLHeadingElement>;
  children: ReactNode;
}>;

/**
 * One section of the Share pane: a full-width divider above it and a content column that stops at 576 px. A titled
 * section is a region named by its heading.
 *
 * @param props - The optional heading and description, and the section's content.
 * @returns A `section` named by its heading, or a `div` when untitled.
 * @public
 * @example <caption>Add a host section after the chosen method's.</caption>
 * ```tsx
 * import { SharePane, SharePaneSection } from '@taucad/workbench-panes/share/share-pane';
 *
 * <SharePane extraSections={<SharePaneSection title='Collaborators'>…</SharePaneSection>} />;
 * ```
 */
export function SharePaneSection({
  title,
  description,
  headingRef,
  children,
}: SharePaneSectionProperties): React.JSX.Element {
  const headingId = useId();
  const content = (
    <div className='flex max-w-xl min-w-0 flex-col gap-4'>
      {title === undefined ? null : (
        <div className='flex flex-col gap-1'>
          <Heading
            ref={headingRef}
            level={3}
            variant='label'
            id={headingId}
            tabIndex={headingRef === undefined ? undefined : -1}
            className={headingRef === undefined ? undefined : 'focus-visible:focus-outline'}
          >
            {title}
          </Heading>
          {description === undefined ? null : <p className='text-sm text-muted-foreground'>{description}</p>}
        </div>
      )}
      {children}
    </div>
  );
  return title === undefined ? (
    <div data-slot='share-pane-section' className='border-t border-border p-4'>
      {content}
    </div>
  ) : (
    <section aria-labelledby={headingId} data-slot='share-pane-section' className='border-t border-border p-4'>
      {content}
    </section>
  );
}

/**
 * The method a source shows: the host's choice, else the one picked here, else the source's initial method, as long
 * as it is offered; otherwise the first.
 *
 * @param source - The host's share source.
 * @param picked - The method picked in this pane, when the host does not keep the choice.
 * @returns The method, or `undefined` when the source offers none.
 */
const resolveMethod = (source: ShareSource, picked: string | undefined): ShareMethodSource | undefined => {
  const wanted = source.method ?? picked ?? source.initialMethod;
  return source.methods.find((method) => method.id === wanted) ?? source.methods[0];
};

function LinkMethodBody({
  method,
  notify,
}: {
  readonly method: Extract<ShareMethodSource, { kind: 'link' }>;
  readonly notify: ShareSource['notify'];
}): React.JSX.Element {
  const [busy, setBusy] = useState(false);
  return (
    <SharePaneFrame isDisabled={busy}>
      <SharePaneSection>
        <ShareLinkBody method={method} notify={notify} onBusyChange={setBusy} />
      </SharePaneSection>
    </SharePaneFrame>
  );
}

/**
 * Properties of {@link SharePane}.
 *
 * @public
 */
export type SharePaneProperties = Readonly<{
  /**
   * Sections the host adds after the chosen method's, inside the pane's one scroll area, under every method. Never
   * pinned. Use {@link SharePaneSection} so they share the pane's dividers.
   */
  extraSections?: ReactNode;
}>;

/**
 * The Share pane body, drawn from the host's {@link ShareSource}: the method picker, the chosen method's sections and
 * the host's sections, in one scroll area.
 *
 * @param props - The host's extra sections.
 * @returns The chosen method's framed body, or an empty slot when the host offers no way to share.
 * @public
 */
export function SharePane({ extraSections }: SharePaneProperties = {}): React.JSX.Element {
  const source = useWorkbenchPanesHost().share;
  const [picked, setPicked] = useState<string>();
  const onMethodChange = source?.onMethodChange;
  const changeMethod = useCallback(
    (id: string): void => {
      setPicked(id);
      onMethodChange?.(id);
    },
    [onMethodChange],
  );
  const method = source === undefined ? undefined : resolveMethod(source, picked);
  const binding = useMemo(
    (): ShareFrameBinding | undefined =>
      source === undefined || method === undefined
        ? undefined
        : { methods: source.methods, method, onMethodChange: changeMethod, extraSections },
    [changeMethod, extraSections, method, source],
  );
  if (source === undefined || method === undefined || binding === undefined) {
    return <div data-slot='share-pane' />;
  }
  return (
    <ShareFrameContext.Provider value={binding}>
      {method.kind === 'link' ? (
        <LinkMethodBody key={method.id} method={method} notify={source.notify} />
      ) : (
        <CustomMethodBody key={method.id} render={method.render} />
      )}
    </ShareFrameContext.Provider>
  );
}

function CustomMethodBody({ render }: { readonly render: () => ReactNode }): ReactNode {
  return render();
}
