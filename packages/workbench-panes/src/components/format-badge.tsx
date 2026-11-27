/*
 * `FormatBadge` and `FormatFileIcon` live in `@taucad/ui/components/format-badge`. This subpath re-exports them so
 * existing imports of `@taucad/workbench-panes/components/format-badge` keep working; import from `@taucad/ui`.
 */
// oxlint-disable-next-line no-barrel-files/no-barrel-files -- published subpath kept for consumers; FormatBadge lives in @taucad/ui
export { FormatBadge, FormatFileIcon } from '@taucad/ui/components/format-badge';
