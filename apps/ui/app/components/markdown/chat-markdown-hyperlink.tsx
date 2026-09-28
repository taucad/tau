import { useCallback } from 'react';
import type { ComponentProps, MouseEvent } from 'react';
import { resolveRootedPath } from '@taucad/utils/path';
import { cn } from '@taucad/ui/utils/cn';
import { MarkdownHyperlink } from '#components/markdown/markdown-hyperlink.js';
import { useProject } from '#hooks/use-project.js';
import { useOptionalFileManager } from '#hooks/use-file-manager.js';
import { desktopBridge, nodeHomeRoot } from '#filesystem/desktop-bridge.js';
import { getProjectFileSystemConfig } from '#filesystem/handle-store.js';
import { toast } from '#components/ui/sonner.js';
import { visit } from 'unist-util-visit';
import type { Root } from 'hast';

const absolutePath = /^(?:\/|[a-z]:[/\\])/i;
const fileExtension = /\.[\da-z]{1,12}$/i;
const resourceRoutes = new Set(['/robots.txt', '/manifest.webmanifest', '/sitemap.xml']);

/** File-shaped chat hrefs are handled by the Workbench, not the app router. */
export function chatFileHref(href: string | undefined): string | undefined {
  if (
    !href ||
    (/^[a-z][\d+.a-z-]*:/i.test(href) && !href.startsWith('file://')) ||
    href.startsWith('#') ||
    resourceRoutes.has(href.split(/[?#]/u, 1)[0] ?? '')
  ) {
    return undefined;
  }
  const withoutSuffix = href.split(/[?#]/u, 1)[0] ?? '';
  try {
    const path = withoutSuffix.startsWith('file://')
      ? decodeURI(new URL(withoutSuffix).pathname)
      : decodeURI(withoutSuffix);
    return fileExtension.test(path) ? path : undefined;
  } catch {
    return undefined;
  }
}

/** Preserve chat file URLs through Streamdown's URL hardener. */
export const rehypeChatFileLinks =
  () =>
  (tree: Root): void => {
    visit(tree, 'element', (node) => {
      if (node.tagName !== 'a') {
        return;
      }
      const { href } = node.properties;
      const path = chatFileHref(typeof href === 'string' ? href : undefined);
      if (path) {
        node.properties.href =
          path.startsWith('/') || path.startsWith('./') || path.startsWith('../') ? path : `./${path}`;
      }
    });
  };

/** Resolve a desktop host file only when it belongs to the active project. */
async function projectPathForHostFile(path: string, projectId: string): Promise<string | undefined> {
  const config = await getProjectFileSystemConfig(projectId);
  if (config?.backend !== 'node') {
    return undefined;
  }
  const root = `${config.path ?? nodeHomeRoot()}/${config.providerBasePath}`.replace(/\/$/u, '');
  return path.startsWith(`${root}/`) ? path.slice(root.length + 1) : undefined;
}

/** Chat-only link renderer. Generic markdown elsewhere keeps its route semantics. */
export function ChatMarkdownHyperlink({ href, className, children, ...rest }: ComponentProps<'a'>): React.JSX.Element {
  const project = useProject({ enableNoContext: true });
  const fileManager = useOptionalFileManager();
  const filePath = chatFileHref(href);

  const open = useCallback(
    async (path: string): Promise<void> => {
      if (!project || !fileManager) {
        throw new Error('Open a project to view this file.');
      }
      const bridge = desktopBridge();
      const isAbsolutePath = absolutePath.test(path);
      const projectPath = isAbsolutePath && bridge ? await projectPathForHostFile(path, project.projectId) : undefined;
      const candidate =
        projectPath ??
        (path.startsWith('/')
          ? resolveRootedPath(path.slice(1))
          : isAbsolutePath
            ? undefined
            : resolveRootedPath(path));
      const { treeService } = await fileManager.whenServicesReady();
      const entry = candidate === undefined ? undefined : await treeService.getEntry(candidate);
      let openedPath = candidate;
      if (entry?.type !== 'file') {
        if (!bridge || !isAbsolutePath) {
          throw new Error('This file is unavailable in the current project.');
        }
        const image = await bridge.generatedImages.read(path);
        openedPath = `.tau/generated-images/${image.path}`;
        await fileManager.writeFile(openedPath, image.bytes, { source: 'user' });
      }
      if (openedPath === undefined) {
        throw new Error('This file is unavailable in the current project.');
      }
      project.editorRef.send({
        type: 'openFile',
        path: openedPath,
        source: 'user',
        ...((entry?.provenance !== undefined && entry.provenance.source !== 'project') || entry?.type !== 'file'
          ? { readOnly: true }
          : {}),
      });
      project.editorRef.send({ type: 'revealFileInTree', path: openedPath });
    },
    [project, fileManager],
  );

  const handleClick = useCallback(
    async (event: MouseEvent<HTMLButtonElement>): Promise<void> => {
      event.stopPropagation();
      if (!filePath) {
        return;
      }
      try {
        await open(filePath);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not open this file.');
      }
    },
    [filePath, open],
  );

  if (!filePath) {
    return (
      <MarkdownHyperlink href={href} className={className} {...rest}>
        {children}
      </MarkdownHyperlink>
    );
  }

  return (
    <button
      type='button'
      className={cn(className, 'cursor-action text-primary underline underline-offset-3 hover:underline')}
      onClick={handleClick}
    >
      {children}
    </button>
  );
}
