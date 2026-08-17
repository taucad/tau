import { describe, it, vi, beforeEach } from 'vitest';
import { RuleTester } from 'eslint';

vi.mock('../tsgolint-utils.js', () => ({
  resolveTsgolintBinary: vi.fn(),
  runTsgolint: vi.fn(() => []),
}));

const { resolveTsgolintBinary, runTsgolint } = await import('../tsgolint-utils.js');
const { validateMdxCodeblocksRule } = await import('./validate-mdx-codeblocks.js');
const mdxParser = await import('../mdx-parser.js');

const ruleTester = new RuleTester({
  languageOptions: { parser: mdxParser },
});

describe('validate-mdx-codeblocks', () => {
  beforeEach(() => {
    vi.mocked(resolveTsgolintBinary).mockReturnValue('/mock/tsgolint');
    vi.mocked(runTsgolint).mockReturnValue([]);
  });

  describe('extraction and skipping', () => {
    it('should pass valid typescript blocks and skip @ts-nocheck blocks', () => {
      ruleTester.run('validate-mdx-codeblocks', validateMdxCodeblocksRule, {
        valid: [
          {
            name: 'block with @ts-nocheck fence meta is skipped',
            filename: '/docs/test.mdx',
            code: '```typescript @ts-nocheck\nconst x: string = 123;\n```',
          },
          {
            name: 'non-typescript code block is ignored',
            filename: '/docs/test.mdx',
            code: '```javascript\nconst x = 1;\n```',
          },
          {
            name: 'empty typescript block is skipped',
            filename: '/docs/test.mdx',
            code: '```typescript\n\n```',
          },
          {
            name: 'plain markdown with no code blocks',
            filename: '/docs/test.mdx',
            code: '# Hello World\n\nSome text here.',
          },
          {
            name: 'valid typescript block with no diagnostics',
            filename: '/docs/test.mdx',
            code: '```typescript\nconst x: number = 1;\n```',
          },
          {
            name: 'mixed content: valid block + @ts-nocheck block',
            filename: '/docs/test.mdx',
            code: '# Guide\n\n```typescript\nconst x: number = 1;\n```\n\n```typescript @ts-nocheck\nreturn x;\n```',
          },
        ],
        invalid: [],
      });
    });
  });

  describe('runtime documentation package boundary', () => {
    it('should reject private bundled-package imports from runtime examples', () => {
      const privateImports = [
        '@taucad/converter',
        '@taucad/events',
        '@taucad/filesystem',
        '@taucad/fs-bridge',
        '@taucad/gltf-extensions',
        '@taucad/json-schema',
        '@taucad/memory',
        '@taucad/rpc',
        '@taucad/types',
        '@taucad/units',
        '@taucad/utils',
        '@taucad/vm',
      ]
        .map((packageName) => `import '${packageName}';`)
        .join('\n');

      ruleTester.run('validate-mdx-codeblocks', validateMdxCodeblocksRule, {
        valid: [
          {
            name: 'runtime examples import the public runtime filesystem surface',
            filename: '/project/apps/ui/content/docs/runtime/guides/test.mdx',
            code: "```typescript\nimport { openFileSystemBridge } from '@taucad/runtime/filesystem';\n```",
          },
          {
            name: 'non-runtime internal documentation may describe private packages',
            filename: '/project/apps/ui/content/docs/internal/test.mdx',
            code: "```typescript\nimport { openFileSystemBridge } from '@taucad/fs-bridge';\n```",
          },
          {
            name: 'comments and ordinary strings are not imports',
            filename: '/project/apps/ui/content/docs/runtime/guides/test.mdx',
            code: "```typescript\n// import '@taucad/events';\nconst example = '@taucad/types';\n```",
          },
          {
            name: 'longer package prefix is not a private package',
            filename: '/project/apps/ui/content/docs/runtime/guides/test.mdx',
            code: "```typescript\nimport '@taucad/types-extra';\n```",
          },
        ],
        invalid: [
          {
            name: 'runtime example imports private fs-bridge package',
            filename: '/project/apps/ui/content/docs/runtime/guides/test.mdx',
            code: "```typescript\nimport { openFileSystemBridge } from '@taucad/fs-bridge';\n```",
            errors: [
              {
                messageId: 'privatePackageImport',
                data: { packageName: '@taucad/fs-bridge' },
              },
            ],
          },
          {
            name: 'all canonical bundled packages are private documentation imports',
            filename: '/project/apps/ui/content/docs/runtime/guides/test.mdx',
            code: `\`\`\`typescript\n${privateImports}\n\`\`\``,
            errors: [
              '@taucad/converter',
              '@taucad/events',
              '@taucad/filesystem',
              '@taucad/fs-bridge',
              '@taucad/gltf-extensions',
              '@taucad/json-schema',
              '@taucad/memory',
              '@taucad/rpc',
              '@taucad/types',
              '@taucad/units',
              '@taucad/utils',
              '@taucad/vm',
            ].map((packageName) => ({ messageId: 'privatePackageImport', data: { packageName } })),
          },
          {
            name: 'subpaths, exports, dynamic imports, and import types are checked even with ts-nocheck',
            filename: '/project/apps/ui/content/docs/runtime/guides/test.mdx',
            code: `\`\`\`typescript @ts-nocheck
import type { FileStat } from '@taucad/types/constants';
export { Topic } from '@taucad/events';
const rpc = import('@taucad/rpc/channel');
type Memory = import('@taucad/memory').SharedPool;
\`\`\``,
            errors: [
              { messageId: 'privatePackageImport', data: { packageName: '@taucad/types' } },
              { messageId: 'privatePackageImport', data: { packageName: '@taucad/events' } },
              { messageId: 'privatePackageImport', data: { packageName: '@taucad/rpc' } },
              { messageId: 'privatePackageImport', data: { packageName: '@taucad/memory' } },
            ],
          },
        ],
      });
    });
  });

  describe('type error reporting', () => {
    it('should report diagnostics from tsgolint', () => {
      vi.mocked(runTsgolint).mockImplementation((_binary, blocks) => {
        return blocks.map((block) => ({
          kind: 1,
          file_path: block.virtualPath,
          range: { pos: 0, end: 5 },
          message: { id: 'TS2322', description: "Type 'string' is not assignable to type 'number'" },
        }));
      });

      ruleTester.run('validate-mdx-codeblocks', validateMdxCodeblocksRule, {
        valid: [],
        invalid: [
          {
            name: 'block with type error reports diagnostic',
            filename: '/docs/test.mdx',
            code: '```typescript\nconst x: number = "hello";\n```',
            errors: [
              {
                messageId: 'typecheckError',
                data: { errorMessage: "TS2322: Type 'string' is not assignable to type 'number'" },
              },
            ],
          },
        ],
      });
    });

    it('should only report diagnostics for blocks without @ts-nocheck', () => {
      vi.mocked(runTsgolint).mockImplementation((_binary, blocks) => {
        return blocks.map((block) => ({
          kind: 1,
          file_path: block.virtualPath,
          range: { pos: 0, end: 5 },
          message: { id: 'TS2322', description: 'Type mismatch' },
        }));
      });

      ruleTester.run('validate-mdx-codeblocks', validateMdxCodeblocksRule, {
        valid: [],
        invalid: [
          {
            name: 'only checkable block gets error, @ts-nocheck block is skipped',
            filename: '/docs/test.mdx',
            code: '```typescript @ts-nocheck\nreturn bad;\n```\n\n```typescript\nconst y = 1;\n```',
            errors: [{ messageId: 'typecheckError' }],
          },
        ],
      });
    });
  });

  describe('binary not available', () => {
    it('should pass all blocks when tsgolint binary is not found', () => {
      vi.mocked(resolveTsgolintBinary).mockReturnValue(undefined);

      ruleTester.run('validate-mdx-codeblocks', validateMdxCodeblocksRule, {
        valid: [
          {
            name: 'no binary → no errors reported',
            filename: '/docs/test.mdx',
            code: '```typescript\nconst x: number = "oops";\n```',
          },
        ],
        invalid: [],
      });
    });
  });
});
