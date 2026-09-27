import { useState, useEffect } from 'react';
import type { ComponentProps } from 'react';
import type { FileEntry } from '@taucad/types';
import { ContextChip } from '#components/chat/context-chip.js';
import { FileLink } from '#components/files/file-link.js';
import { useAtReferenceContext } from '#components/chat/at-reference-context.js';
import { resolveAtReference } from '#utils/at-reference.utils.js';
import type { ResolvedAtReference } from '#utils/at-reference.utils.js';

type AtReferenceChipProps = ComponentProps<'mark'> & {
  readonly 'data-at-reference'?: string;
  readonly 'data-invocation'?: string;
};

/**
 * Renders `@path` references and known invocation tokens (`/skill`, `$skill`) as chips in chat messages.
 * Resolves paths against the file tree and chats for display.
 *
 * Registered as the `mark` component override in `MarkdownViewerChat`.
 * `rehypeAtReferences` emits `<mark>` elements with either
 * `data-at-reference` or `data-invocation` attributes.
 */
export function AtReferenceChip(props: AtReferenceChipProps): React.JSX.Element {
  const invocation = props['data-invocation'];
  if (invocation) {
    return <InvocationChip token={invocation} />;
  }

  const path = props['data-at-reference'];
  if (!path) {
    return <mark {...props} />;
  }

  return <ResolvedChip path={path} />;
}

function InvocationChip({ token }: { readonly token: string }): React.JSX.Element {
  const { knownTokens } = useAtReferenceContext();
  return knownTokens.has(token) ? <ContextChip label={token} chipType='skill' /> : <span>{token}</span>;
}

function ResolvedChip({ path }: { readonly path: string }): React.JSX.Element {
  const { treeService, chatsById } = useAtReferenceContext();
  const [resolved, setResolved] = useState<ResolvedAtReference | undefined>(() => {
    const lazyTree = treeService?.getTreeSnapshot() ?? new Map<string, FileEntry>();
    return resolveAtReference(path, lazyTree, chatsById);
  });

  useEffect(() => {
    if (resolved ?? !treeService) {
      return;
    }

    let cancelled = false;
    // async-iife: bootstrap — resolve @-reference against lazy tree entry
    void (async () => {
      const entry = await treeService.getEntry(path);
      // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- cleanup sets cancelled before async continuation resumes
      if (cancelled || !entry) {
        return;
      }
      const lazyTree = new Map<string, FileEntry>([[path, entry]]);
      const result = resolveAtReference(path, lazyTree, chatsById);
      if (result) {
        setResolved(result);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [path, treeService, chatsById, resolved]);

  if (!resolved) {
    return <span>{`@${path}`}</span>;
  }

  return (
    <FileLink path={path} asChild>
      <ContextChip label={resolved.displayName} chipType={resolved.chipType} isInteractive />
    </FileLink>
  );
}
