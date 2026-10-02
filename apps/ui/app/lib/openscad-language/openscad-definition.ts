import type * as Monaco from 'monaco-editor';
import type { MonacoWorkspaceFs } from '#lib/monaco-workspace-fs/monaco-workspace-fs.types.js';
import { parseOpenScad } from '#lib/openscad-language/openscad-pseudoparser.js';
import { openscadAnglePathToFileUri } from '#lib/openscad-language/openscad-include-uri.js';
import {
  findFunctionDeclaration,
  findFunctionDeclarationInLines,
  findModuleDeclaration,
  findModuleDeclarationInLines,
  findVariableDeclaration,
  findVariableDeclarationInLines,
} from '#lib/openscad-language/openscad-utils.js';

export type OpenscadDefinitionContext = Readonly<{
  workspaceFs: MonacoWorkspaceFs;
}>;

type DefinitionInImportedOptions = Readonly<{
  monaco: typeof Monaco;
  workspaceFs: MonacoWorkspaceFs;
  targetUri: Monaco.Uri;
  wordText: string;
  mode: 'use' | 'include';
}>;
function definitionRangeForLine(
  monaco: typeof Monaco,
  model: Monaco.editor.ITextModel,
  lineNumber: number,
): Monaco.IRange {
  return new monaco.Range(lineNumber, 1, lineNumber, model.getLineContent(lineNumber).length + 1);
}

function definitionRangeForImportedLine(monaco: typeof Monaco, lineLength: number, lineNumber: number): Monaco.IRange {
  return new monaco.Range(lineNumber, 1, lineNumber, lineLength + 1);
}

function localDefinition(
  monaco: typeof Monaco,
  model: Monaco.editor.ITextModel,
  wordText: string,
): Monaco.languages.Location | undefined {
  const variableInfo = findVariableDeclaration(model, wordText);
  if (variableInfo) {
    return {
      uri: model.uri,
      range: definitionRangeForLine(monaco, model, variableInfo.lineNumber),
    };
  }

  const moduleInfo = findModuleDeclaration(model, wordText);
  if (moduleInfo) {
    return {
      uri: model.uri,
      range: definitionRangeForLine(monaco, model, moduleInfo.lineNumber),
    };
  }

  const functionInfo = findFunctionDeclaration(model, wordText);
  if (functionInfo) {
    return {
      uri: model.uri,
      range: definitionRangeForLine(monaco, model, functionInfo.lineNumber),
    };
  }

  return undefined;
}

async function definitionInImportedFile(
  options: DefinitionInImportedOptions,
): Promise<Monaco.languages.Location | undefined> {
  const { monaco, workspaceFs, targetUri, wordText, mode } = options;
  const reader = await workspaceFs.openTextProvider(targetUri);
  if (!reader) {
    return undefined;
  }

  try {
    const lines = reader.text.split(/\r\n|\r|\n/);
    if (mode === 'include') {
      const variableInfo = findVariableDeclarationInLines(lines, wordText);
      if (variableInfo) {
        return {
          uri: targetUri,
          range: definitionRangeForImportedLine(
            monaco,
            reader.lineLength(variableInfo.lineNumber),
            variableInfo.lineNumber,
          ),
        };
      }
    }

    const moduleInfo = findModuleDeclarationInLines(lines, wordText);
    if (moduleInfo) {
      return {
        uri: targetUri,
        range: definitionRangeForImportedLine(monaco, reader.lineLength(moduleInfo.lineNumber), moduleInfo.lineNumber),
      };
    }

    const functionInfo = findFunctionDeclarationInLines(lines, wordText);
    if (functionInfo) {
      return {
        uri: targetUri,
        range: definitionRangeForImportedLine(
          monaco,
          reader.lineLength(functionInfo.lineNumber),
          functionInfo.lineNumber,
        ),
      };
    }

    return undefined;
  } finally {
    reader.dispose();
  }
}

/**
 * @param monaco
 * @param context When set, `use`/`include` imports resolve text via
 * {@link MonacoWorkspaceFs.openTextProvider} (same materialisation authority as Cmd+Click).
 */
export const createDefinitionProvider = (
  monaco: typeof Monaco,
  context?: OpenscadDefinitionContext,
): Monaco.languages.DefinitionProvider => {
  return {
    async provideDefinition(model, position, cancellationToken) {
      const word = model.getWordAtPosition(position);
      if (!word?.word || cancellationToken.isCancellationRequested) {
        return undefined;
      }

      const wordText = word.word;
      const local = localDefinition(monaco, model, wordText);
      if (local) {
        return local;
      }

      if (!context) {
        return undefined;
      }

      const parsed = parseOpenScad(model.uri.toString(), model.getValue(), true);

      const useHits = await Promise.all(
        parsed.uses.map(async (p) =>
          definitionInImportedFile({
            monaco,
            workspaceFs: context.workspaceFs,
            targetUri: monaco.Uri.parse(openscadAnglePathToFileUri(model.uri.toString(), p)),
            wordText,
            mode: 'use',
          }),
        ),
      );
      const fromUse = useHits.find((location) => location !== undefined);
      if (fromUse) {
        return fromUse;
      }

      const includeHits = await Promise.all(
        parsed.includes.map(async (p) =>
          definitionInImportedFile({
            monaco,
            workspaceFs: context.workspaceFs,
            targetUri: monaco.Uri.parse(openscadAnglePathToFileUri(model.uri.toString(), p)),
            wordText,
            mode: 'include',
          }),
        ),
      );
      const fromInclude = includeHits.find((location) => location !== undefined);
      if (fromInclude) {
        return fromInclude;
      }

      return undefined;
    },
  };
};
