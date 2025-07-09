/**
 * An naive hover provider for OpenSCAD.
 *
 * This is a simple hover provider that provides hover information for OpenSCAD code.
 * This would be more robust by using an OpenSCAD LSP to provide hover information.
 *
 * Currently supports:
 * - Built-in constants
 * - Built-in functions
 * - Built-in modules
 * - User-defined variables
 * - User-defined modules
 * - User-defined functions
 * - Group titles
 *
 * TODO:
 * - Parse same-line variable comments describing constraints:
 *   - Maximum 64 character string variable: `Address = "My Street, 123"; // 64
 *   - Enums: `Type = "T"; // [T:Text, W:Wi-Fi,P:Phone Call,V:vCard]`
 * - Find a way to describe types for user-defined module parameters & return types
 */

import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api';
import type { IMarkdownString } from 'monaco-editor/esm/vs/editor/editor.api';
import { openscadConstants, openscadFunctions, openscadSymbols } from '~/lib/openscad-language/openscad-symbols.js';
import {
  findVariableDeclaration,
  findModuleDeclaration,
  findFunctionDeclaration,
  findCurrentModuleFunctionScope,
  findGroupName,
  isPositionInComment,
} from '~/lib/openscad-language/openscad-utils.js';
import type { VariableInfo, ModuleInfo, FunctionInfo } from '~/lib/openscad-language/openscad-utils.js';

function inferParameterType(defaultValue: string | undefined): string {
  if (!defaultValue) {
    return 'any';
  }

  const trimmed = defaultValue.trim();

  // Check for numbers
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return 'number';
  }

  // Check for booleans
  if (trimmed === 'true' || trimmed === 'false') {
    return 'boolean';
  }

  // Check for strings
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return 'string';
  }

  // Check for arrays
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return 'array';
  }

  // Default to any for complex expressions
  return 'any';
}

function createGroupHover(
  monaco: typeof Monaco,
  groupName: string,
  position: Monaco.Position,
  word: Monaco.editor.IWordAtPosition,
): Monaco.languages.Hover {
  return {
    contents: [
      {
        value: `_@group_ — ${groupName}`,
      },
    ],
    range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
  };
}

function createParameterUsageHover(
  monaco: typeof Monaco,
  parameterName: string,
  scopeInfo: { type: 'module' | 'function'; info: ModuleInfo | FunctionInfo },
  position: Monaco.Position,
  word: Monaco.editor.IWordAtPosition,
): Monaco.languages.Hover {
  const contents = [];

  // Find the specific parameter
  const parameter = scopeInfo.info.parameters.find((parameter_) => {
    const [name] = parameter_.includes('=') ? parameter_.split('=').map((p) => p.trim()) : [parameter_.trim()];
    return name === parameterName;
  });

  if (parameter) {
    const parameterInfo = formatParameters({ userDefined: [parameter] }, { singleParameter: parameterName });

    if (parameterInfo.singleParameterSignature) {
      contents.push({
        value: `\`\`\`openscad\n${parameterInfo.singleParameterSignature}\n\`\`\``,
      });
    }

    // Add context about where this parameter is from
    contents.push({
      value: `Parameter of ${scopeInfo.type} \`${scopeInfo.info.name}\``,
    });

    if (parameterInfo.singleParameterDetails) {
      for (const detail of parameterInfo.singleParameterDetails) {
        contents.push({
          value: detail,
        });
      }
    }
  }

  return {
    contents,
    range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
  };
}

// Built-in parameter type from symbols
type BuiltInParameter = {
  name: string;
  type: string;
  description?: string;
  required: boolean;
  defaultValue?: string | number | boolean;
};

// Union type for parameter sources
type ParameterSource =
  | {
      builtIn: BuiltInParameter[];
    }
  | {
      userDefined: string[];
    };

type ParameterFormatOptions = {
  includeTitle?: boolean;
  includeDescription?: boolean;
  singleParameter?: string;
};

function formatSingleBuiltInParameter(
  parameter: BuiltInParameter,
  options: { includeDescription?: boolean } = {},
): {
  signature: string;
  details: string[];
} {
  const { includeDescription = true } = options;
  const optional = parameter.required ? '' : '?';
  const signature = `(parameter) ${parameter.name}${optional}: ${parameter.type}`;

  const details: string[] = [];
  if (parameter.description && includeDescription) {
    details.push(parameter.description);
  }

  if (parameter.defaultValue !== undefined) {
    const defaultValueString =
      typeof parameter.defaultValue === 'string' ? parameter.defaultValue : JSON.stringify(parameter.defaultValue);
    details.push(`_@default_ — ${defaultValueString}`);
  }

  return { signature, details };
}

function formatSingleUserDefinedParameter(parameterString: string): {
  signature: string;
  details: string[];
} {
  const [name, defaultValue] = parameterString.includes('=')
    ? parameterString.split('=').map((part) => part.trim())
    : [parameterString.trim(), undefined];

  const type = inferParameterType(defaultValue);
  const optional = defaultValue === undefined ? '' : '?';
  const signature = `(parameter) ${name}${optional}: ${type}`;

  const details: string[] = [];
  if (defaultValue) {
    details.push(`_@default_ — ${defaultValue}`);
  }

  return { signature, details };
}

function formatParameterSignature(source: ParameterSource): string {
  if ('builtIn' in source) {
    return source.builtIn
      .map((parameter) => {
        const optional = parameter.required ? '' : '?';
        return `${parameter.name}${optional}: ${parameter.type}`;
      })
      .join(', ');
  }

  return source.userDefined
    .map((parameter) => {
      const [name, defaultValue] = parameter.includes('=')
        ? parameter.split('=').map((p) => p.trim())
        : [parameter.trim(), undefined];
      const type = inferParameterType(defaultValue);
      const optional = defaultValue === undefined ? '' : '?';
      return `${name}${optional}: ${type}`;
    })
    .join(', ');
}

function formatParameterDetailedList(
  source: ParameterSource,
  options: { includeDescription?: boolean } = {},
): string | undefined {
  const { includeDescription = true } = options;

  if ('builtIn' in source) {
    if (source.builtIn.length === 0) return undefined;

    return source.builtIn
      .map((parameter) => {
        const required = parameter.required ? '**required**' : 'optional';
        const defaultValue = parameter.defaultValue ? ` (default: ${parameter.defaultValue})` : '';
        const description = parameter.description && includeDescription ? ` — ${parameter.description}` : '';
        return `\n\`${parameter.name}\`: _${parameter.type}_${description} _(${required})_${defaultValue}`;
      })
      .join('\n');
  }

  if (source.userDefined.length === 0) return undefined;

  return source.userDefined
    .map((parameter) => {
      const [name, defaultValue] = parameter.includes('=')
        ? parameter.split('=').map((p) => p.trim())
        : [parameter.trim(), undefined];
      const type = inferParameterType(defaultValue);
      const required = defaultValue === undefined ? '**required**' : 'optional';
      const defaultValueText = defaultValue ? ` (default: ${defaultValue})` : '';
      return `\n\`${name}\`: ${type} _(${required})_${defaultValueText}`;
    })
    .join('\n');
}

function formatSingleParameter(
  source: ParameterSource,
  parameterName: string,
  options: { includeDescription?: boolean } = {},
): {
  signature?: string;
  details?: string[];
} {
  if ('builtIn' in source) {
    const parameter = source.builtIn.find((p) => p.name === parameterName);
    if (!parameter) return {};

    const result = formatSingleBuiltInParameter(parameter, options);
    return {
      signature: result.signature,
      details: result.details,
    };
  }

  const parameter = source.userDefined.find((p) => {
    const [name] = p.includes('=') ? p.split('=').map((part) => part.trim()) : [p.trim()];
    return name === parameterName;
  });

  if (!parameter) return {};

  const result = formatSingleUserDefinedParameter(parameter);
  return {
    signature: result.signature,
    details: result.details,
  };
}

function formatParameters(
  source: ParameterSource,
  options: ParameterFormatOptions = {},
): {
  signature: string;
  detailedList?: string;
  singleParameterSignature?: string;
  singleParameterDetails?: string[];
} {
  const { includeTitle = false, includeDescription = true, singleParameter } = options;

  // Handle single parameter formatting
  if (singleParameter) {
    const result = formatSingleParameter(source, singleParameter, { includeDescription });
    return {
      signature: '',
      singleParameterSignature: result.signature,
      singleParameterDetails: result.details,
    };
  }

  // Handle multiple parameter formatting
  const signature = formatParameterSignature(source);
  const detailedList = formatParameterDetailedList(source, { includeDescription });

  const finalDetailedList = detailedList && includeTitle ? `_@parameters_\n${detailedList}` : detailedList;

  return {
    signature,
    detailedList: finalDetailedList,
  };
}

function createVariableHover(
  monaco: typeof Monaco,
  variableInfo: VariableInfo,
  position: Monaco.Position,
  word: Monaco.editor.IWordAtPosition,
): Monaco.languages.Hover {
  const contents = [];

  // Check if this variable is also a built-in constant
  const allSymbols = [...openscadSymbols, ...openscadFunctions, ...openscadConstants];
  const builtInSymbol = allSymbols.find((sym) => sym.name === variableInfo.name);

  // Variable signature - prefer built-in signature if available
  if (builtInSymbol && builtInSymbol.type === 'constant') {
    const signature = `constant ${builtInSymbol.name}: ${variableInfo.type}`;
    contents.push({
      value: `\`\`\`openscad\n${signature}\n\`\`\``,
    });
  } else {
    const signature = `var ${variableInfo.name}: ${variableInfo.type}`;
    contents.push({
      value: `\`\`\`openscad\n${signature}\n\`\`\``,
    });
  }

  // Description - prefer built-in description if available
  if (builtInSymbol?.description) {
    contents.push({
      value: builtInSymbol.description,
    });
  } else if (variableInfo.description) {
    contents.push({
      value: variableInfo.description,
    });
  }

  // Show default value if this is a built-in constant with a default
  if (builtInSymbol && 'defaultValue' in builtInSymbol && builtInSymbol.defaultValue !== undefined) {
    contents.push({
      value: `_@default_ — \`${builtInSymbol.defaultValue}\``,
    });
  } else {
    // Otherwise, show the assigned value
    contents.push({
      value: `_@default_ — \`${variableInfo.value}\``,
    });
  }

  // Show examples if this is a built-in constant
  if (builtInSymbol?.examples && builtInSymbol.examples.length > 0) {
    const examplesList = builtInSymbol.examples.map((example) => `\`\`\`openscad\n${example}\n\`\`\``).join('\n\n');
    contents.push({
      value: `_@examples_\n${examplesList}`,
    });
  }

  // Show category if this is a built-in constant
  if (builtInSymbol?.category) {
    contents.push({
      value: `_@category_ — ${builtInSymbol.category}`,
    });
  }

  // Show group if available
  if (variableInfo.group) {
    contents.push({
      value: `_@group_ — ${variableInfo.group}`,
    });
  }

  return {
    contents,
    range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
  };
}

function createModuleHover(
  monaco: typeof Monaco,
  moduleInfo: ModuleInfo,
  position: Monaco.Position,
  word: Monaco.editor.IWordAtPosition,
): Monaco.languages.Hover {
  const contents = [];

  // Module signature with typed parameters
  const parameterInfo = formatParameters({ userDefined: moduleInfo.parameters });
  const signature = `module ${moduleInfo.name}(${parameterInfo.signature})`;
  contents.push({
    value: `\`\`\`openscad\n${signature}\n\`\`\``,
  });

  // Description from comments
  if (moduleInfo.description) {
    contents.push({
      value: moduleInfo.description,
    });
  }

  // Show parameters in detailed format if any
  if (moduleInfo.parameters.length > 0 && parameterInfo.detailedList) {
    contents.push({
      value: `_@parameters_\n${parameterInfo.detailedList}`,
    });
  }

  return {
    contents,
    range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
  };
}

function createFunctionHover(
  monaco: typeof Monaco,
  functionInfo: FunctionInfo,
  position: Monaco.Position,
  word: Monaco.editor.IWordAtPosition,
): Monaco.languages.Hover {
  const contents = [];

  // Function signature with typed parameters
  const parameterInfo = formatParameters({ userDefined: functionInfo.parameters });
  const signature = `function ${functionInfo.name}(${parameterInfo.signature})`;
  contents.push({
    value: `\`\`\`openscad\n${signature}\n\`\`\``,
  });

  // Description from comments
  if (functionInfo.description) {
    contents.push({
      value: functionInfo.description,
    });
  }

  // Show parameters in detailed format if any
  if (functionInfo.parameters.length > 0 && parameterInfo.detailedList) {
    contents.push({
      value: `_@parameters_\n${parameterInfo.detailedList}`,
    });
  }

  return {
    contents,
    range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
  };
}

type ParameterContext = {
  functionName: string;
  parameterName: string;
  isBuiltIn: boolean;
};

function findParameterContext(
  model: Monaco.editor.ITextModel,
  position: Monaco.Position,
  word: Monaco.editor.IWordAtPosition,
): ParameterContext | undefined {
  const line = model.getLineContent(position.lineNumber);
  const wordStart = word.startColumn - 1;

  // Look backwards from the current position to find the function/module call
  let searchPos = wordStart - 1;
  let parenDepth = 0;
  let functionName = '';

  // Search backwards to find the opening parenthesis and function name
  while (searchPos >= 0) {
    const char = line[searchPos];

    if (char === ')') {
      parenDepth++;
    } else if (char === '(') {
      if (parenDepth === 0) {
        // Found the opening parenthesis, now find the function name
        let nameEnd = searchPos - 1;
        while (nameEnd >= 0 && /\s/.test(line[nameEnd])) {
          nameEnd--; // Skip whitespace
        }

        let nameStart = nameEnd;
        while (nameStart >= 0 && /\w/.test(line[nameStart])) {
          nameStart--;
        }

        functionName = line.slice(nameStart + 1, nameEnd + 1);
        break;
      } else {
        parenDepth--;
      }
    }

    searchPos--;
  }

  if (!functionName) {
    return undefined;
  }

  // Check if this is a built-in function/module
  const allSymbols = [...openscadSymbols, ...openscadFunctions, ...openscadConstants];
  const isBuiltIn = allSymbols.some((sym) => sym.name === functionName);

  return {
    functionName,
    parameterName: word.word,
    isBuiltIn,
  };
}

function createParameterHover(
  monaco: typeof Monaco,
  parameterContext: ParameterContext,
  position: Monaco.Position,
  word: Monaco.editor.IWordAtPosition,
  model: Monaco.editor.ITextModel,
): Monaco.languages.Hover | undefined {
  const contents = [];

  if (parameterContext.isBuiltIn) {
    // Handle built-in functions/modules
    const allSymbols = [...openscadSymbols, ...openscadFunctions, ...openscadConstants];
    const symbol = allSymbols.find((sym) => sym.name === parameterContext.functionName);

    if (symbol && 'parameters' in symbol && symbol.parameters) {
      const parameterInfo = formatParameters(
        { builtIn: symbol.parameters },
        { singleParameter: parameterContext.parameterName },
      );

      if (parameterInfo.singleParameterSignature) {
        contents.push({
          value: `\`\`\`openscad\n${parameterInfo.singleParameterSignature}\n\`\`\``,
        });

        if (parameterInfo.singleParameterDetails) {
          for (const detail of parameterInfo.singleParameterDetails) {
            contents.push({
              value: detail,
            });
          }
        }
      }
    }
  } else {
    // Handle user-defined functions/modules
    const moduleInfo = findModuleDeclaration(model, parameterContext.functionName);
    const functionInfo = findFunctionDeclaration(model, parameterContext.functionName);

    const userDefinedInfo = moduleInfo ?? functionInfo;
    if (userDefinedInfo) {
      const parameterInfo = formatParameters(
        { userDefined: userDefinedInfo.parameters },
        { singleParameter: parameterContext.parameterName },
      );

      if (parameterInfo.singleParameterSignature) {
        contents.push({
          value: `\`\`\`openscad\n${parameterInfo.singleParameterSignature}\n\`\`\``,
        });

        if (parameterInfo.singleParameterDetails) {
          for (const detail of parameterInfo.singleParameterDetails) {
            contents.push({
              value: detail,
            });
          }
        }
      }
    }
  }

  if (contents.length === 0) {
    return undefined;
  }

  return {
    contents,
    range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
  };
}

export function createHoverProvider(monaco: typeof Monaco): Monaco.languages.HoverProvider {
  return {
    // eslint-disable-next-line complexity -- this is a complex function
    provideHover(model, position) {
      const word = model.getWordAtPosition(position);
      if (!word?.word) {
        return null;
      }

      const wordText = word.word;

      // First, check if we're hovering over a group name in a comment (this should work even in comments)
      const groupName = findGroupName(model, position, word);
      if (groupName) {
        return createGroupHover(monaco, groupName, position, word);
      }

      // Don't show hover for other words inside comments
      if (isPositionInComment(model, position)) {
        return null;
      }

      // Check if we're hovering over a parameter in a function/module call
      const parameterContext = findParameterContext(model, position, word);
      if (parameterContext) {
        const parameterHover = createParameterHover(monaco, parameterContext, position, word, model);
        if (parameterHover) {
          return parameterHover;
        }
      }

      // Check if we're hovering over a parameter usage within a module/function scope
      const currentScope = findCurrentModuleFunctionScope(model, position);
      if (currentScope) {
        const parameterMatch = currentScope.info.parameters.find((parameter) => {
          const [name] = parameter.includes('=') ? parameter.split('=').map((p) => p.trim()) : [parameter.trim()];
          return name === wordText;
        });

        if (parameterMatch) {
          return createParameterUsageHover(monaco, wordText, currentScope, position, word);
        }
      }

      // Check for user-defined variables in the current file
      const variableInfo = findVariableDeclaration(model, wordText);
      if (variableInfo) {
        return createVariableHover(monaco, variableInfo, position, word);
      }

      // Check for user-defined modules in the current file
      const moduleInfo = findModuleDeclaration(model, wordText);
      if (moduleInfo) {
        return createModuleHover(monaco, moduleInfo, position, word);
      }

      // Check for user-defined functions in the current file
      const functionInfo = findFunctionDeclaration(model, wordText);
      if (functionInfo) {
        return createFunctionHover(monaco, functionInfo, position, word);
      }

      // Search for the symbol in all built-in symbol arrays
      const allSymbols = [...openscadSymbols, ...openscadFunctions, ...openscadConstants];
      const symbol = allSymbols.find((sym) => sym.name === wordText);

      if (!symbol) {
        return null;
      }

      // Build hover content based on symbol type
      const contents: IMarkdownString[] = [];

      // Build signature at the top
      let signature = '';
      let parameterInfo: ReturnType<typeof formatParameters> | undefined;

      switch (symbol.type) {
        case 'module': {
          if ('parameters' in symbol && symbol.parameters && symbol.parameters.length > 0) {
            parameterInfo = formatParameters({ builtIn: symbol.parameters });
            signature = `module ${symbol.name}(${parameterInfo.signature})`;
          } else {
            signature = `module ${symbol.name}()`;
          }

          break;
        }

        case 'function': {
          if ('parameters' in symbol && symbol.parameters && symbol.parameters.length > 0) {
            parameterInfo = formatParameters({ builtIn: symbol.parameters });
            const returnType = 'returnType' in symbol && symbol.returnType ? `: ${symbol.returnType}` : '';
            signature = `function ${symbol.name}(${parameterInfo.signature})${returnType}`;
          } else {
            const returnType = 'returnType' in symbol && symbol.returnType ? `: ${symbol.returnType}` : '';
            signature = `function ${symbol.name}()${returnType}`;
          }

          break;
        }

        case 'constant': {
          signature = `constant ${symbol.name}`;

          break;
        }
        // No default
      }

      // Add signature as code block
      if (signature) {
        contents.push({
          value: `\`\`\`openscad\n${signature}\n\`\`\``,
        });
      }

      // Description
      if (symbol.description) {
        contents.push({
          value: symbol.description,
        });
      }

      // Parameters (for modules and functions)
      if (parameterInfo?.detailedList) {
        contents.push({
          value: `_@parameters_\n${parameterInfo.detailedList}`,
        });
      }

      // Default value (for constants)
      if (symbol.type === 'constant' && 'defaultValue' in symbol && symbol.defaultValue !== undefined) {
        contents.push({
          value: `_@default_ — \`${symbol.defaultValue}\``,
        });
      }

      // Return type (for functions)
      if ('returnType' in symbol && symbol.returnType) {
        contents.push({
          value: `_@returns_ — ${symbol.returnType}`,
        });
      }

      // Examples
      if (symbol.examples && symbol.examples.length > 0) {
        const examplesList = symbol.examples.map((example) => `\`\`\`openscad\n${example}\n\`\`\``).join('\n\n');
        contents.push({
          value: `_@examples_\n${examplesList}`,
        });
      }

      // Additional documentation
      if ('documentation' in symbol && symbol.documentation) {
        contents.push({
          value: `_@documentation_ —\n${symbol.documentation}`,
        });
      }

      // Category
      if (symbol.category) {
        contents.push({
          value: `_@category_ — ${symbol.category}`,
        });
      }

      return {
        contents,
        range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
      };
    },
  };
}
