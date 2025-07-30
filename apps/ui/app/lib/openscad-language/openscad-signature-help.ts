/* eslint-disable max-params -- TODO: refactor */
import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { requirementDescriptor } from '#lib/openscad-language/openscad-descriptions.js';
import { openscadSymbols, openscadFunctions } from '#lib/openscad-language/openscad-symbols.js';
import type { OpenscadModuleSymbol, OpenscadFunctionSymbol } from '#lib/openscad-language/openscad-symbols.js';
import {
  findModuleDeclaration,
  findFunctionDeclaration,
  inferParameterType,
  findFunctionCall,
} from '#lib/openscad-language/openscad-utils.js';

function createSignatureInformation(
  _monacoInstance: typeof Monaco,
  symbol: OpenscadModuleSymbol | OpenscadFunctionSymbol,
  activeParameter: number,
): Monaco.languages.SignatureInformation {
  const parameters: Monaco.languages.ParameterInformation[] = [];
  let label = `${symbol.name}(`;

  if ('parameters' in symbol && symbol.parameters && symbol.parameters.length > 0) {
    // Build parameter information
    for (const [index, parameter] of symbol.parameters.entries()) {
      const parameterText = parameter.type ? `${parameter.name}: ${parameter.type}` : parameter.name;
      const startIndex = label.length;

      if (index > 0) {
        label += ', ';
      }

      label += parameterText;
      const endIndex = label.length;

      const documentation = parameter.description;

      parameters.push({
        label: [startIndex, endIndex],
        documentation: {
          value: documentation,
        },
      });
    }
  }

  label += ')';

  return {
    label,
    parameters,
    activeParameter,
  };
}

function createUserDefinedSignatureInformation(
  _monacoInstance: typeof Monaco,
  name: string,
  parameters: string[],
  description: string | undefined,
  activeParameter: number,
): Monaco.languages.SignatureInformation {
  const parameterInfos: Monaco.languages.ParameterInformation[] = [];
  let label = `${name}(`;

  if (parameters.length > 0) {
    for (const [index, parameter] of parameters.entries()) {
      const [parameterName, defaultValue] = parameter.includes('=')
        ? parameter.split('=').map((p) => p.trim())
        : [parameter.trim(), undefined];

      // Infer type from default value
      const inferredType = inferParameterType(defaultValue);
      const parameterText = inferredType === 'any' ? parameterName : `${parameterName}: ${inferredType}`;

      const startIndex = label.length;

      if (index > 0) {
        label += ', ';
      }

      label += parameterText;
      const endIndex = label.length;

      const requiredInfo = defaultValue ? ` ${requirementDescriptor.optional}` : ` ${requirementDescriptor.required}`;
      const defaultInfo = defaultValue ? ` *default: ${defaultValue}*` : '';

      parameterInfos.push({
        label: [startIndex, endIndex],
        documentation: {
          value: `${requiredInfo}${defaultInfo}`,
        },
      });
    }
  }

  label += ')';

  return {
    label,
    documentation: {
      value: description ?? '',
    },
    parameters: parameterInfos,
    activeParameter,
  };
}

export function createSignatureHelpProvider(monaco: typeof Monaco): Monaco.languages.SignatureHelpProvider {
  return {
    signatureHelpTriggerCharacters: ['(', ','],
    signatureHelpRetriggerCharacters: [','],
    provideSignatureHelp(model, position) {
      const functionCall = findFunctionCall(model, position);

      if (!functionCall) {
        return undefined;
      }

      const { functionName, parameterIndex } = functionCall;

      // Check built-in symbols first
      const allBuiltIns = [...openscadSymbols, ...openscadFunctions];
      const builtInSymbol = allBuiltIns.find((symbol) => symbol.name === functionName);

      if (builtInSymbol) {
        const signature = createSignatureInformation(monaco, builtInSymbol, parameterIndex);
        return {
          value: {
            signatures: [signature],
            activeSignature: 0,
            activeParameter: parameterIndex,
          },
          dispose() {
            // Noop
          },
        };
      }

      // Check user-defined modules
      const moduleInfo = findModuleDeclaration(model, functionName);
      if (moduleInfo) {
        const signature = createUserDefinedSignatureInformation(
          monaco,
          moduleInfo.name,
          moduleInfo.parameters,
          moduleInfo.description,
          parameterIndex,
        );
        return {
          value: {
            signatures: [signature],
            activeSignature: 0,
            activeParameter: parameterIndex,
          },
          dispose() {
            // Noop
          },
        };
      }

      // Check user-defined functions
      const functionInfo = findFunctionDeclaration(model, functionName);
      if (functionInfo) {
        const signature = createUserDefinedSignatureInformation(
          monaco,
          functionInfo.name,
          functionInfo.parameters,
          functionInfo.description,
          parameterIndex,
        );
        return {
          value: {
            signatures: [signature],
            activeSignature: 0,
            activeParameter: parameterIndex,
          },
          dispose() {
            // Noop
          },
        };
      }

      return undefined;
    },
  };
}
