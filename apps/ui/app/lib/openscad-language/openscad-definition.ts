import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api';
import {
  findFunctionDeclaration,
  findModuleDeclaration,
  findVariableDeclaration,
} from '~/lib/openscad-language/openscad-utils.js';

export const createDefinitionProvider = (monaco: typeof Monaco): Monaco.languages.DefinitionProvider => {
  return {
    provideDefinition(model, position) {
      const word = model.getWordAtPosition(position);
      if (!word?.word) {
        return null;
      }

      const wordText = word.word;

      // Check for user-defined variables in the current file
      const variableInfo = findVariableDeclaration(model, wordText);
      if (variableInfo) {
        return {
          uri: model.uri,
          range: new monaco.Range(
            variableInfo.lineNumber,
            1, // Start of line
            variableInfo.lineNumber,
            model.getLineContent(variableInfo.lineNumber).length + 1, // End of line
          ),
        };
      }

      // Check for user-defined modules in the current file
      const moduleInfo = findModuleDeclaration(model, wordText);
      if (moduleInfo) {
        return {
          uri: model.uri,
          range: new monaco.Range(
            moduleInfo.lineNumber,
            1, // Start of line
            moduleInfo.lineNumber,
            model.getLineContent(moduleInfo.lineNumber).length + 1, // End of line
          ),
        };
      }

      // Check for user-defined functions in the current file
      const functionInfo = findFunctionDeclaration(model, wordText);
      if (functionInfo) {
        return {
          uri: model.uri,
          range: new monaco.Range(
            functionInfo.lineNumber,
            1, // Start of line
            functionInfo.lineNumber,
            model.getLineContent(functionInfo.lineNumber).length + 1, // End of line
          ),
        };
      }

      // For built-in symbols, we can't navigate to their definition
      // since they're not in the current file
      return null;
    },
  };
};
