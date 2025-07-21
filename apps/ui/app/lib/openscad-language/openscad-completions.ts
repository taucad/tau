/* eslint-disable max-params -- TODO: refactor */
import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api';
import {
  documentationDescriptor,
  requirementDescriptor,
  signatureSymbolDescriptor,
} from '~/lib/openscad-language/openscad-descriptions.js';
import { openscadSymbols, openscadFunctions, openscadConstants } from '~/lib/openscad-language/openscad-symbols.js';
import type {
  OpenscadModuleSymbol,
  OpenscadFunctionSymbol,
  OpenscadConstantSymbol,
} from '~/lib/openscad-language/openscad-symbols.js';
import {
  findCurrentModuleFunctionScope,
  isPositionInComment,
  findGroupName,
  findUserDefinedItems,
  inferParameterType,
  findParameterCompletions,
} from '~/lib/openscad-language/openscad-utils.js';

function createDocumentationForSymbol(symbol: OpenscadModuleSymbol | OpenscadFunctionSymbol): string {
  const parts: string[] = [];

  // Description
  if (symbol.description) {
    parts.push(symbol.description);
  }

  // Parameters
  if ('parameters' in symbol && symbol.parameters && symbol.parameters.length > 0) {
    const parameterList = symbol.parameters
      .map((parameter) => {
        const required = parameter.required ? requirementDescriptor.required : requirementDescriptor.optional;
        const defaultValue =
          'defaultValue' in parameter && parameter.defaultValue ? ` (default: ${parameter.defaultValue})` : '';
        const description = parameter.description ? ` — ${parameter.description}` : '';
        return `\n\`${parameter.name}\`: _${parameter.type}_ _(${required})_${defaultValue}${description}`;
      })
      .join('');
    parts.push(`\n${documentationDescriptor.parameters}:${parameterList}`);
  }

  // Return type (for functions)
  if ('returnType' in symbol) {
    parts.push(`\n${documentationDescriptor.returns}: ${symbol.returnType}`);
  }

  // Examples
  if (symbol.examples && symbol.examples.length > 0) {
    const examplesList = symbol.examples.map((example) => `\`\`\`openscad\n${example}\n\`\`\``).join('\n\n');
    parts.push(`\n${documentationDescriptor.examples}:\n${examplesList}`);
  }

  // Additional documentation
  if ('documentation' in symbol && symbol.documentation) {
    parts.push(`\n${documentationDescriptor.documentation}:\n${symbol.documentation}`);
  }

  // Category
  if (symbol.category) {
    parts.push(`\n${documentationDescriptor.category}: ${symbol.category}`);
  }

  return parts.join('\n');
}

function createDocumentationForConstant(constant: OpenscadConstantSymbol): string {
  const parts: string[] = [];

  // Description
  if (constant.description) {
    parts.push(constant.description);
  }

  // Default value
  if ('defaultValue' in constant && constant.defaultValue !== undefined) {
    parts.push(`\n${documentationDescriptor.default}: \`${constant.defaultValue}\``);
  }

  // Examples
  if (constant.examples && constant.examples.length > 0) {
    const examplesList = constant.examples.map((example) => `\`\`\`openscad\n${example}\n\`\`\``).join('\n\n');
    parts.push(`\n${documentationDescriptor.examples}:\n${examplesList}`);
  }

  // Additional documentation
  if ('documentation' in constant && constant.documentation) {
    parts.push(`\n${documentationDescriptor.documentation}:\n${constant.documentation}`);
  }

  // Category
  if (constant.category) {
    parts.push(`\n${documentationDescriptor.category}: ${constant.category}`);
  }

  return parts.join('\n');
}

function createInsertTextForSymbol(symbol: OpenscadModuleSymbol): string {
  if ('parameters' in symbol && symbol.parameters && symbol.parameters.length > 0) {
    // Create snippet with parameter placeholders - modules/functions with parameters get semicolon
    const parameterSnippets = symbol.parameters
      .map((parameter, index) => {
        const placeholder = index + 1;
        const defaultValue = 'defaultValue' in parameter ? (parameter.defaultValue ?? '') : '';
        return `${parameter.name}=\${${placeholder}:${defaultValue}}`;
      })
      .join(', ');
    return `${symbol.name}(${parameterSnippets});`;
  }

  // Modules without parameters are container modules that need curly braces
  return `${symbol.name}() {\n\t\${1}\n}`;
}

function createInsertTextForFunction(func: OpenscadFunctionSymbol): string {
  if ('parameters' in func && func.parameters && func.parameters.length > 0) {
    // Create snippet with parameter placeholders - functions with parameters get semicolon
    const parameterSnippets = func.parameters
      .map((parameter, index) => {
        const placeholder = index + 1;
        return `\${${placeholder}:${parameter.name}}`;
      })
      .join(', ');
    return `${func.name}(${parameterSnippets});`;
  }

  return `${func.name}();`;
}

function createUserDefinedModuleCompletion(
  monaco: typeof Monaco,
  name: string,
  parameters: string[],
  description: string | undefined,
  position: Monaco.Position,
  // eslint-disable-next-line @typescript-eslint/no-restricted-types -- this is the Monaco API type
  word: Monaco.editor.IWordAtPosition | null,
): Monaco.languages.CompletionItem {
  // Create snippet with parameter placeholders
  let insertText = name;
  if (parameters.length > 0) {
    const parameterSnippets = parameters
      .map((parameter, index) => {
        const placeholder = index + 1;
        const [parameterName, defaultValue] = parameter.includes('=')
          ? parameter.split('=').map((p) => p.trim())
          : [parameter.trim(), undefined];

        if (defaultValue) {
          return `${parameterName}=\${${placeholder}:${defaultValue}}`;
        }

        return `${parameterName}=\${${placeholder}}`;
      })
      .join(', ');
    insertText = `${name}(${parameterSnippets});`;
  } else {
    insertText = `${name}() {\n\t\${${parameters.length + 1}}\n}`;
  }

  return {
    label: name,
    kind: monaco.languages.CompletionItemKind.Module,
    documentation: description ? { value: description } : undefined,
    detail: `${signatureSymbolDescriptor.module} ${name}`,
    insertText,
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    range: {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: word?.startColumn ?? position.column,
      endColumn: word?.endColumn ?? position.column,
    },
  };
}

function createUserDefinedFunctionCompletion(
  monaco: typeof Monaco,
  name: string,
  parameters: string[],
  description: string | undefined,
  position: Monaco.Position,
  // eslint-disable-next-line @typescript-eslint/no-restricted-types -- this is the Monaco API type
  word: Monaco.editor.IWordAtPosition | null,
): Monaco.languages.CompletionItem {
  // Create snippet with parameter placeholders
  let insertText = name;
  if (parameters.length > 0) {
    const parameterSnippets = parameters
      .map((parameter, index) => {
        const placeholder = index + 1;
        const [parameterName] = parameter.includes('=')
          ? parameter.split('=').map((p) => p.trim())
          : [parameter.trim()];
        return `\${${placeholder}:${parameterName}}`;
      })
      .join(', ');
    insertText = `${name}(${parameterSnippets});`;
  } else {
    insertText = `${name}();`;
  }

  return {
    label: name,
    kind: monaco.languages.CompletionItemKind.Function,
    documentation: description ? { value: description } : undefined,
    detail: `${signatureSymbolDescriptor.function} ${name}`,
    insertText,
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    range: {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: word?.startColumn ?? position.column,
      endColumn: word?.endColumn ?? position.column,
    },
  };
}

function createUserDefinedVariableCompletion(
  monaco: typeof Monaco,
  name: string,
  value: string,
  type: string | undefined,
  description: string | undefined,
  position: Monaco.Position,
  // eslint-disable-next-line @typescript-eslint/no-restricted-types -- this is the Monaco API type
  word: Monaco.editor.IWordAtPosition | null,
): Monaco.languages.CompletionItem {
  const documentationParts: string[] = [];

  // Add description first if available
  if (description) {
    documentationParts.push(description);
  }

  // Add default value using the same pattern as hover provider
  documentationParts.push(`${documentationDescriptor.default} — \`${value}\``);

  return {
    label: name,
    kind: monaco.languages.CompletionItemKind.Variable,
    documentation: { value: documentationParts.join('\n\n') },
    detail: `${signatureSymbolDescriptor.variable} ${name}: ${type ?? 'any'}`,
    insertText: name,
    range: {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: word?.startColumn ?? position.column,
      endColumn: word?.endColumn ?? position.column,
    },
  };
}

function createParameterCompletion(
  monaco: typeof Monaco,
  name: string,
  defaultValue: string | undefined,
  scopeType: 'module' | 'function',
  position: Monaco.Position,
  // eslint-disable-next-line @typescript-eslint/no-restricted-types -- this is the Monaco API type
  word: Monaco.editor.IWordAtPosition | null,
): Monaco.languages.CompletionItem {
  const inferredType = inferParameterType(defaultValue);
  const defaultInfo = defaultValue ? ` = ${defaultValue}` : '';
  const documentation = `Parameter of ${scopeType}${defaultInfo ? `\n\n**Default:** \`${defaultValue}\`\n**Type:** \`${inferredType}\`` : `\n\n**Type:** \`${inferredType}\``}`;

  return {
    label: {
      label: name,
      detail: `: ${inferredType}`,
    },
    kind: monaco.languages.CompletionItemKind.Property,
    documentation: { value: documentation },
    detail: `${signatureSymbolDescriptor.parameter} ${name}: ${inferredType}`,
    insertText: name,
    range: {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: word?.startColumn ?? position.column,
      endColumn: word?.endColumn ?? position.column,
    },
  };
}

export function createCompletionItemProvider(monaco: typeof Monaco): Monaco.languages.CompletionItemProvider {
  return {
    // eslint-disable-next-line complexity -- TODO: refactor
    provideCompletionItems(model, position) {
      const completions: Monaco.languages.CompletionItem[] = [];

      // Get word at position to understand context
      const word = model.getWordAtPosition(position);

      // Check if we're hovering over a group name in a comment
      const groupName = findGroupName(
        model,
        position,
        word ?? { word: '', startColumn: position.column, endColumn: position.column },
      );

      // Skip completions if we're in a comment (unless it's a group comment)
      if (!groupName && isPositionInComment(model, position)) {
        return { suggestions: [] };
      }

      // If we're in a group comment, no completions needed
      if (groupName) {
        return { suggestions: [] };
      }

      // Check if we're inside function/module parameters
      const parameterNames = findParameterCompletions(model, position);
      if (parameterNames.length > 0) {
        for (const parameterName of parameterNames) {
          completions.push({
            label: parameterName,
            kind: monaco.languages.CompletionItemKind.Property,
            detail: `${signatureSymbolDescriptor.parameter} ${parameterName}`,
            insertText: `${parameterName}=`,
            range: {
              startLineNumber: position.lineNumber,
              endLineNumber: position.lineNumber,
              startColumn: word?.startColumn ?? position.column,
              endColumn: word?.endColumn ?? position.column,
            },
          });
        }
      }

      // Add built-in modules
      for (const symbol of openscadSymbols) {
        completions.push({
          label: symbol.name,
          kind: monaco.languages.CompletionItemKind.Module,
          documentation: {
            value: createDocumentationForSymbol(symbol),
          },
          detail: `${signatureSymbolDescriptor.module} ${symbol.name}`,
          insertText: createInsertTextForSymbol(symbol),
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range: {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word?.startColumn ?? position.column,
            endColumn: word?.endColumn ?? position.column,
          },
        });
      }

      // Add built-in functions
      for (const func of openscadFunctions) {
        completions.push({
          label: func.name,
          kind: monaco.languages.CompletionItemKind.Function,
          documentation: {
            value: createDocumentationForSymbol(func),
          },
          detail: `${signatureSymbolDescriptor.function} ${func.name}`,
          insertText: createInsertTextForFunction(func),
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range: {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word?.startColumn ?? position.column,
            endColumn: word?.endColumn ?? position.column,
          },
        });
      }

      // Add built-in constants
      for (const constant of openscadConstants) {
        completions.push({
          label: constant.name,
          kind: monaco.languages.CompletionItemKind.Constant,
          documentation: {
            value: createDocumentationForConstant(constant),
          },
          detail: `${signatureSymbolDescriptor.constant} ${constant.name}`,
          insertText: constant.name,
          range: {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word?.startColumn ?? position.column,
            endColumn: word?.endColumn ?? position.column,
          },
        });
      }

      // Check if we're inside a module/function scope to handle parameters
      const currentScope = findCurrentModuleFunctionScope(model, position);

      // Add user-defined items
      const userDefined = findUserDefinedItems(model);

      // Filter out current scope parameters from user variables if we're inside a scope
      let filteredVariables = userDefined.variables;
      if (currentScope) {
        const parameterNames = new Set(
          currentScope.info.parameters.map((parameter) => {
            const [name] = parameter.includes('=') ? parameter.split('=').map((p) => p.trim()) : [parameter.trim()];
            return name;
          }),
        );

        // Filter out parameters from variables list
        filteredVariables = userDefined.variables.filter((variable) => !parameterNames.has(variable.name));

        // Add parameter completions for current scope
        for (const parameter of currentScope.info.parameters) {
          const [name, defaultValue] = parameter.includes('=')
            ? parameter.split('=').map((p) => p.trim())
            : [parameter.trim(), undefined];

          completions.push(createParameterCompletion(monaco, name, defaultValue, currentScope.type, position, word));
        }
      }

      // Add user-defined variables (excluding current scope parameters)
      for (const variable of filteredVariables) {
        completions.push(
          createUserDefinedVariableCompletion(
            monaco,
            variable.name,
            variable.value,
            variable.type,
            variable.description,
            position,
            word,
          ),
        );
      }

      // Add user-defined modules
      for (const module of userDefined.modules) {
        completions.push(
          createUserDefinedModuleCompletion(monaco, module.name, module.parameters, module.description, position, word),
        );
      }

      // Add user-defined functions
      for (const func of userDefined.functions) {
        completions.push(
          createUserDefinedFunctionCompletion(monaco, func.name, func.parameters, func.description, position, word),
        );
      }

      return {
        suggestions: completions,
      };
    },
  };
}
