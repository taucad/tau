import { getLanguageService, InsertTextFormat, TextDocument } from 'vscode-json-languageservice';
import { z } from 'zod';
import { projectManifestSchema, projectManifestSchemaUrl } from '@taucad/types';

type Request = Readonly<{
  id: number;
  method: 'validate' | 'complete' | 'hover' | 'format' | 'fold';
  uri: string;
  text: string;
  version: number;
  jsonc: boolean;
  offset?: number;
}>;

const service = getLanguageService({});
service.configure({
  validate: true,
  allowComments: false,
  schemas: [
    {
      uri: projectManifestSchemaUrl,
      fileMatch: ['tau.json'],
      schema: z.toJSONSchema(projectManifestSchema, { target: 'draft-7' }),
    },
  ],
});

function offsetRange(
  document: TextDocument,
  range: { start: { line: number; character: number }; end: { line: number; character: number } },
): { from: number; to: number } {
  return { from: document.offsetAt(range.start), to: document.offsetAt(range.end) };
}

self.addEventListener('message', (event: MessageEvent<Request>) => {
  const request = event.data;
  // async-iife: bootstrap -- worker message dispatch reports completion through postMessage.
  void (async (): Promise<void> => {
    try {
      const document = TextDocument.create(
        request.uri,
        request.jsonc ? 'jsonc' : 'json',
        request.version,
        request.text,
      );
      const parsed = service.parseJSONDocument(document);
      let result: unknown;
      switch (request.method) {
        case 'validate': {
          const diagnostics = await service.doValidation(document, parsed, {
            comments: request.jsonc ? 'ignore' : 'error',
          });
          result = diagnostics.map((diagnostic) => ({
            ...offsetRange(document, diagnostic.range),
            message: diagnostic.message,
            severity: diagnostic.severity,
            source: diagnostic.source,
            code: diagnostic.code,
          }));
          break;
        }
        case 'complete': {
          const completions = await service.doComplete(document, document.positionAt(request.offset ?? 0), parsed);
          result =
            completions?.items.map((item) => ({
              label: item.label,
              kind: item.kind,
              detail: item.detail,
              documentation: typeof item.documentation === 'string' ? item.documentation : item.documentation?.value,
              insertText: item.insertText ?? item.label,
              isSnippet: item.insertTextFormat === InsertTextFormat.Snippet,
              range: item.textEdit && 'range' in item.textEdit ? offsetRange(document, item.textEdit.range) : undefined,
            })) ?? [];
          break;
        }
        case 'hover': {
          const hover = await service.doHover(document, document.positionAt(request.offset ?? 0), parsed);
          result = hover
            ? {
                text: Array.isArray(hover.contents)
                  ? hover.contents.map((content) => (typeof content === 'string' ? content : content.value)).join('\n')
                  : typeof hover.contents === 'string'
                    ? hover.contents
                    : hover.contents.value,
                range: hover.range ? offsetRange(document, hover.range) : undefined,
              }
            : undefined;
          break;
        }
        case 'format': {
          const edits = service.format(document, undefined, { tabSize: 2, insertSpaces: true });
          result = edits.map((edit) => ({ ...offsetRange(document, edit.range), insert: edit.newText }));
          break;
        }
        case 'fold': {
          result = service
            .getFoldingRanges(document)
            .map((range) => ({ fromLine: range.startLine, toLine: range.endLine }));
          break;
        }
      }
      self.postMessage({ id: request.id, result });
    } catch (error) {
      self.postMessage({ id: request.id, error: error instanceof Error ? error.message : String(error) });
    }
  })();
});
