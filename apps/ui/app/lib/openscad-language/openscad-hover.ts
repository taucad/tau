import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { openscadConstants, openscadFunctions, openscadSymbols } from '~/lib/openscad-language/openscad-symbols.js';
import {
  findVariableDeclaration,
  findModuleDeclaration,
  findFunctionDeclaration,
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

function createVariableHover(
  monaco: typeof Monaco,
  variableInfo: VariableInfo,
  position: Monaco.Position,
  word: Monaco.editor.IWordAtPosition,
): Monaco.languages.Hover {
  const contents = [];

  // Variable signature
  const signature = `var ${variableInfo.name}: ${variableInfo.type}`;
  contents.push({
    value: `\`\`\`openscad\n${signature}\n\`\`\``,
  });

  // Description from comments
  if (variableInfo.description) {
    contents.push({
      value: variableInfo.description,
    });
  }

  // Show the assigned value
  contents.push({
    value: `**Value:** \`${variableInfo.value}\``,
  });

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
  const parametersWithTypes = moduleInfo.parameters
    .map((parameter) => {
      const [name, defaultValue] = parameter.includes('=')
        ? parameter.split('=').map((p) => p.trim())
        : [parameter.trim(), undefined];
      const type = inferParameterType(defaultValue);
      const optional = defaultValue === undefined ? '' : '?';
      return `${name}${optional}: ${type}`;
    })
    .join(', ');

  const signature = `module ${moduleInfo.name}(${parametersWithTypes})`;
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
  if (moduleInfo.parameters.length > 0) {
    const parametersList = moduleInfo.parameters
      .map((parameter) => {
        const [name, defaultValue] = parameter.includes('=')
          ? parameter.split('=').map((p) => p.trim())
          : [parameter.trim(), undefined];
        const type = inferParameterType(defaultValue);
        const required = defaultValue === undefined ? '**required**' : 'optional';
        const defaultValue_ = defaultValue ? ` (default: ${defaultValue})` : '';
        return `- \`${name}\`: ${type} _(${required})_${defaultValue_}`;
      })
      .join('\n');

    contents.push({
      value: `**Parameters:**\n${parametersList}`,
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

  // Function signature
  contents.push({
    value: `\`\`\`openscad\n${functionInfo.signature}\n\`\`\``,
  });

  // Description from comments
  if (functionInfo.description) {
    contents.push({
      value: functionInfo.description,
    });
  }

  // Show parameters if any
  if (functionInfo.parameters.length > 0) {
    contents.push({
      value: `**Parameters:** \`${functionInfo.parameters.join(', ')}\``,
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
      const parameter = symbol.parameters.find((p) => p.name === parameterContext.parameterName);
      if (parameter) {
        // Show only the specific parameter signature
        const required = parameter.required ? '' : '?';
        contents.push({
          value: `\`\`\`openscad\n(property) ${parameter.name}${required}: ${parameter.type}\n\`\`\``,
        });

        // Parameter description
        if (parameter.description) {
          contents.push({
            value: parameter.description,
          });
        }

        // Show default value if any
        if ('defaultValue' in parameter && parameter.defaultValue) {
          const defaultValueString =
            typeof parameter.defaultValue === 'string'
              ? parameter.defaultValue
              : JSON.stringify(parameter.defaultValue);
          contents.push({
            value: `(default: ${defaultValueString})`,
          });
        }
      }
    }
  } else {
    // Handle user-defined functions/modules
    const moduleInfo = findModuleDeclaration(model, parameterContext.functionName);
    const functionInfo = findFunctionDeclaration(model, parameterContext.functionName);

    const userDefinedInfo = moduleInfo ?? functionInfo;
    if (userDefinedInfo) {
      const parameter = userDefinedInfo.parameters.find((p) => {
        const [name] = p.includes('=') ? p.split('=').map((p) => p.trim()) : [p.trim()];
        return name === parameterContext.parameterName;
      });

      if (parameter) {
        const [name, defaultValue] = parameter.includes('=')
          ? parameter.split('=').map((p) => p.trim())
          : [parameter.trim(), undefined];
        const type = inferParameterType(defaultValue);
        const optional = defaultValue === undefined ? '' : '?';

        // Show only the specific parameter signature
        contents.push({
          value: `\`\`\`openscad\n(property) ${name}${optional}: ${type}\n\`\`\``,
        });

        // Show default value if any
        if (defaultValue) {
          contents.push({
            value: `(default: ${defaultValue})`,
          });
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

      // First, check if we're hovering over a parameter in a function/module call
      const parameterContext = findParameterContext(model, position, word);
      if (parameterContext) {
        const parameterHover = createParameterHover(monaco, parameterContext, position, word, model);
        if (parameterHover) {
          return parameterHover;
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
      const contents: Monaco.languages.MarkdownString[] = [];

      // Build signature at the top
      let signature = '';
      switch (symbol.type) {
        case 'module': {
          if ('parameters' in symbol && symbol.parameters && symbol.parameters.length > 0) {
            const parametersWithTypes = symbol.parameters
              .map((parameter) => {
                const optional = parameter.required ? '' : '?';
                return `${parameter.name}${optional}: ${parameter.type}`;
              })
              .join(', ');
            signature = `module ${symbol.name}(${parametersWithTypes})`;
          } else {
            signature = `module ${symbol.name}()`;
          }

          break;
        }

        case 'function': {
          if ('parameters' in symbol && symbol.parameters && symbol.parameters.length > 0) {
            const parametersWithTypes = symbol.parameters
              .map((parameter) => {
                const optional = parameter.required ? '' : '?';
                return `${parameter.name}${optional}: ${parameter.type}`;
              })
              .join(', ');
            const returnType = 'returnType' in symbol && symbol.returnType ? `: ${symbol.returnType}` : '';
            signature = `function ${symbol.name}(${parametersWithTypes})${returnType}`;
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
      if ('parameters' in symbol && symbol.parameters && symbol.parameters.length > 0) {
        const parametersList = symbol.parameters
          .map((parameter) => {
            const required = parameter.required ? '**required**' : 'optional';
            const defaultValue = parameter.defaultValue ? ` (default: ${parameter.defaultValue})` : '';
            return `- \`${parameter.name}\`: ${parameter.type} - ${parameter.description} _(${required})_${defaultValue}`;
          })
          .join('\n');

        contents.push({
          value: `**Parameters:**\n${parametersList}`,
        });
      }

      // Return type (for functions)
      if ('returnType' in symbol && symbol.returnType) {
        contents.push({
          value: `**Returns:** ${symbol.returnType}`,
        });
      }

      // Examples
      if (symbol.examples && symbol.examples.length > 0) {
        const examplesList = symbol.examples.map((example) => `\`\`\`openscad\n${example}\n\`\`\``).join('\n\n');
        contents.push({
          value: `**Examples:**\n${examplesList}`,
        });
      }

      // Additional documentation
      if ('documentation' in symbol && symbol.documentation) {
        contents.push({
          value: `**Documentation:**\n${symbol.documentation}`,
        });
      }

      // Category
      if (symbol.category) {
        contents.push({
          value: `@category — ${symbol.category}`,
        });
      }

      return {
        contents,
        range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
      };
    },
  };
}
