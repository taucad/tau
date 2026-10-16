import { createContext, useCallback, useContext, useId, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useWorkbenchPanesHost } from '#host/workbench-host.jsx';
import { ShareLinkBody } from '#share/share-link-body.jsx';
import { ShareMethodPicker } from '#share/share-method-picker.jsx';
import type { ShareMethodSource, ShareSource } from '#share/share-source.js';

type ShareFrameBinding = Readonly<{
  methods: readonly ShareMethodSource[];
  method: ShareMethodSource;
  onMethodChange: (id: string) => void;
}>;

const ShareFrameContext = createContext<ShareFrameBinding | undefined>(undefined);

/**
 * Properties of {@link SharePaneFrame}.
 *
 * @public
 */
export type SharePaneFrameProperties = Readonly<{
  /** Shown under the title. */
  description: string;
  /** Disables the method picker, for a body that is busy. */
  isDisabled?: boolean;
  children: ReactNode;
}>;

/**
 * The Share pane's frame: the title, the body's description, the method picker and a scrolling body. A link method's
 * body is framed by the pane; a custom method's `render` draws this frame around its own body.
 *
 * @param props - The description, whether the picker is disabled, and the body.
 * @returns The section holding the header and the scrolling body.
 * @public
 */
export function SharePaneFrame({
  description,
  isDisabled = false,
  children,
}: SharePaneFrameProperties): React.JSX.Element {
  const binding = useContext(ShareFrameContext);
  if (binding === undefined) {
    throw new Error('SharePaneFrame rendered outside SharePane.');
  }
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className='flex size-full min-h-0 min-w-0 flex-col bg-background'>
      <header className='shrink-0 border-b border-border p-4'>
        <h2 id={titleId} className='text-base font-semibold'>
          Share project
        </h2>
        <p className='mt-1 text-sm text-muted-foreground'>{description}</p>
        <div className='mt-4 min-w-0'>
          <ShareMethodPicker
            methods={binding.methods}
            value={binding.method}
            isDisabled={isDisabled}
            onChange={binding.onMethodChange}
          />
        </div>
      </header>
      <div className='min-h-0 flex-1 overflow-y-auto p-4'>{children}</div>
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
    <SharePaneFrame description={method.description} isDisabled={busy}>
      <ShareLinkBody method={method} notify={notify} onBusyChange={setBusy} />
    </SharePaneFrame>
  );
}

/**
 * The Share pane body, drawn from the host's {@link ShareSource}: the chosen method's body under a frame whose picker
 * lists the other methods.
 *
 * @returns The chosen method's framed body, or an empty slot when the host offers no way to share.
 * @public
 */
export function SharePane(): React.JSX.Element {
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
        : { methods: source.methods, method, onMethodChange: changeMethod },
    [changeMethod, method, source],
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
