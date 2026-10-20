import { useEffect, useRef, useState } from 'react';
import type { IDockviewPanelHeaderProps } from 'dockview-react';
import { Box } from 'lucide-react';
import { WorkbenchTab } from '@taucad/workbench-panes/components/workbench-tab';
import { FileExtensionIcon } from '#components/icons/file-extension-icon.js';

export type DockviewTabProps = IDockviewPanelHeaderProps & {
  /**
   * Viewer tabs use the same cube glyph as {@link ViewerLink} / chat viewer
   * affordances; editor tabs keep extension-based icons.
   */
  readonly leadingIcon?: 'extension' | 'viewer';
  /** Concrete icon for utility tabs. Editor and viewer defaults remain unchanged. */
  readonly icon?: React.ReactNode;
};

export type DockviewTabIconSource = Pick<IDockviewPanelHeaderProps, 'api' | 'params'>;
export type DockviewTabIconRenderer = (properties: DockviewTabIconSource) => React.ReactNode;

type DockviewTabParameters = {
  readonly entryPath?: unknown;
  readonly filePath?: unknown;
};

const resolveFullTitle = (properties: DockviewTabProps, title: string): string => {
  const parameters = properties.params as DockviewTabParameters | undefined;

  if (typeof parameters?.filePath === 'string' && parameters.filePath.length > 0) {
    return parameters.filePath;
  }

  if (typeof parameters?.entryPath === 'string' && parameters.entryPath.length > 0) {
    return parameters.entryPath;
  }

  return title;
};

export function DockviewTabIcon({
  title,
  leadingIcon = 'extension',
  icon,
}: {
  readonly title: string;
  readonly leadingIcon?: DockviewTabProps['leadingIcon'];
  readonly icon?: React.ReactNode;
}): React.ReactNode {
  if (icon !== undefined && icon !== null) {
    return icon;
  }

  return leadingIcon === 'viewer' ? (
    <Box aria-hidden className='relative -bottom-px size-3 shrink-0' />
  ) : (
    <FileExtensionIcon filename={title} className='size-3 shrink-0' />
  );
}

/**
 * Custom Dockview tab: the shared `WorkbenchTab` leaf as the content of dockview's `.dv-tab`, with a leading icon
 * before the title.
 *
 * Reuses the dv-default-tab / dv-default-tab-content / dv-default-tab-action
 * class names so all built-in + theme CSS applies unchanged.
 *
 * The close glyph is a pointer target only. A focusable control inside
 * `role="tab"` is a nested interactive, so keyboard and assistive technology
 * close through Dockview's tablist Delete/Backspace handler, which the tab
 * advertises with `aria-keyshortcuts`, and through the tab's context menu.
 */
export function DockviewTab(properties: DockviewTabProps): React.JSX.Element {
  const { api, icon, leadingIcon = 'extension' } = properties;
  const [title, setTitle] = useState(api.title ?? '');
  const closeRef = useRef<HTMLSpanElement>(null);
  const fullTitle = resolveFullTitle(properties, title);

  // Keep title in sync when the panel updates it
  useEffect(() => {
    const disposable = api.onDidTitleChange((event) => {
      setTitle(event.title);
    });

    return () => {
      disposable.dispose();
    };
  }, [api]);

  // Dockview owns the actual keyboard-focus target outside this React root.
  useEffect(() => {
    const tab = closeRef.current?.closest<HTMLElement>('.dv-tab');
    if (!tab) {
      return;
    }

    tab.setAttribute('aria-label', fullTitle);
    tab.setAttribute('aria-keyshortcuts', 'Delete');

    return () => {
      if (tab.getAttribute('aria-label') === fullTitle) {
        tab.removeAttribute('aria-label');
      }
    };
  }, [fullTitle]);

  /*
   * Dockview listens natively on `.dv-tab`, which sits between this portal and
   * the React root, so React handlers run after it has already activated the
   * tab or started a drag. Like Dockview's own default tab action, the close
   * target cancels its pointerdown natively so the tab ignores it.
   */
  useEffect(() => {
    const close = closeRef.current;
    if (!close) {
      return;
    }

    const handlePointerDown = (event: PointerEvent): void => {
      event.preventDefault();
    };

    const handleClick = (event: MouseEvent): void => {
      if (event.defaultPrevented) {
        return;
      }

      event.preventDefault();
      api.close();
    };

    close.addEventListener('pointerdown', handlePointerDown);
    close.addEventListener('click', handleClick);

    return () => {
      close.removeEventListener('pointerdown', handlePointerDown);
      close.removeEventListener('click', handleClick);
    };
  }, [api]);

  return (
    <WorkbenchTab
      as='div'
      icon={<DockviewTabIcon title={title} leadingIcon={leadingIcon} icon={icon} />}
      title={title}
      fullTitle={fullTitle}
      closeRef={closeRef}
      className='dv-default-tab'
      contentClassName='dv-default-tab-content mr-0!'
      titleClassName='dockview-tab-title'
      closeClassName='dv-default-tab-action size-4.5! rounded-[calc(var(--dv-tab-border-radius)-0.25rem)]! bg-transparent p-0! hover:bg-nested-action-hover!'
    />
  );
}
