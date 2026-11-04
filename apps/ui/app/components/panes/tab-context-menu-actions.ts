import type { DockviewPanelApi } from 'dockview-react';
import { toast } from '#components/ui/sonner.js';

/**
 * Close all panels in the same group except the given one.
 */
export function closeOtherPanels(api: DockviewPanelApi): void {
  const { group } = api;
  const panelsToClose = group.panels.filter((panel) => panel.id !== api.id);

  for (const panel of panelsToClose) {
    panel.api.close();
  }
}

/**
 * Close all panels to the right of the given panel in the same group.
 */
export function closePanelsToTheRight(api: DockviewPanelApi): void {
  const { group } = api;
  const { panels } = group;
  const currentIndex = panels.findIndex((panel) => panel.id === api.id);

  if (currentIndex === -1) {
    return;
  }

  // Close from end to avoid index shifting issues
  const panelsToClose = panels.slice(currentIndex + 1);
  for (const panel of [...panelsToClose].reverse()) {
    panel.api.close();
  }
}

/**
 * Close all panels to the left of the given panel in the same group.
 */
export function closePanelsToTheLeft(api: DockviewPanelApi): void {
  const { group } = api;
  const { panels } = group;
  const currentIndex = panels.findIndex((panel) => panel.id === api.id);

  if (currentIndex === -1) {
    return;
  }

  // Close from end of the slice to avoid index shifting issues
  const panelsToClose = panels.slice(0, currentIndex);
  for (const panel of [...panelsToClose].reverse()) {
    panel.api.close();
  }
}

/**
 * Close all panels in the same group as the given panel.
 */
export function closeAllPanelsInGroup(api: DockviewPanelApi): void {
  const { group } = api;
  const panelsToClose = [...group.panels];

  for (const panel of panelsToClose.reverse()) {
    panel.api.close();
  }
}

/**
 * Copy a path string to the clipboard.
 *
 * The browser can refuse the write (`NotAllowedError` when the document lost
 * focus or the platform denies clipboard access), so a refusal is reported to
 * the person instead of escaping the menu action as an unhandled rejection.
 */
export async function copyPathToClipboard(path: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(path);
  } catch (error) {
    toast.error('Failed to copy path', {
      description: error instanceof Error ? error.message : String(error),
    });
  }
}
