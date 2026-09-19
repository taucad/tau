/**
 * The sidebar's resting geometry and state, shared by the shell that renders it
 * (`#components/layout/page.js`), the provider that persists it
 * (`#components/ui/sidebar.js`) and the placeholders that stand in for it before
 * either has mounted. A leaf module on purpose: a loading skeleton must not pull
 * the whole shell into its graph to know how wide the sidebar is.
 */

/** The sidebar's width when the shell first lays out, in pixels. */
export const sidebarPreferredWidth = 224;

/** Whether the sidebar is open before the person has set it. */
export const sidebarDefaultOpen = true;
