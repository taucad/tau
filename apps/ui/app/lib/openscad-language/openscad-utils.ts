/* eslint-disable max-depth -- TODO: refactor */
import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { openscadFunctions, openscadSymbols } from '~/lib/openscad-language/openscad-symbols.js';

export type VariableInfo = {
  name: string;
  value: string;
  description?: string;
  group?: string;
  lineNumber: number;
  type?: string;
};

export type ModuleInfo = {
  name: string;
  lineNumber: number;
  description?: string;
  parameters: string[];
  signature: string;
};

export type FunctionInfo = {
  name: string;
  lineNumber: number;
  description?: string;
  parameters: string[];
  signature: string;
};

export function findCurrentModuleFunctionScope(
  model: Monaco.editor.ITextModel,
  position: Monaco.Position,
): { type: 'module' | 'function'; info: ModuleInfo | FunctionInfo } | undefined {
  const lines = model.getLinesContent();
  const currentLineIndex = position.lineNumber - 1;

  // Search backwards from current position to find module/function declaration
  for (let i = currentLineIndex; i >= 0; i--) {
    const line = lines[i];

    // Look for module declarations: module name(...) [optional modifiers like union()] {
    const moduleMatch = /^\s*module\s+([a-zA-Z_]\w*)\s*\(([^)]*)\).*?{?\s*$/.exec(line);
    if (moduleMatch) {
      const moduleName = moduleMatch[1];
      const moduleInfo = findModuleDeclaration(model, moduleName);
      if (moduleInfo && moduleInfo.lineNumber === i + 1) {
        return { type: 'module', info: moduleInfo };
      }
    }

    // Look for function declarations: function name(...) = ...;
    const functionMatch = /^\s*function\s+([a-zA-Z_]\w*)\s*\(([^)]*)\)\s*=/.exec(line);
    if (functionMatch) {
      const functionName = functionMatch[1];
      const functionInfo = findFunctionDeclaration(model, functionName);
      if (functionInfo && functionInfo.lineNumber === i + 1) {
        return { type: 'function', info: functionInfo };
      }
    }
  }

  return undefined;
}

export function findGroupName(
  model: Monaco.editor.ITextModel,
  position: Monaco.Position,
  word: Monaco.editor.IWordAtPosition,
): string | undefined {
  const line = model.getLineContent(position.lineNumber);

  // Check if the current line contains a group comment pattern: /* [GroupName] */
  const groupMatch = /\/\*\s*\[([^\]]+)]\s*\*\//.exec(line);
  if (!groupMatch) {
    return undefined;
  }

  const groupName = groupMatch[1];
  const groupStart = groupMatch.index + groupMatch[0].indexOf('[') + 1;
  const groupEnd = groupStart + groupName.length;

  // Check if the word position is within the group name
  const wordStart = word.startColumn - 1; // Convert to 0-based
  const wordEnd = word.endColumn - 1;

  if (wordStart >= groupStart && wordEnd <= groupEnd) {
    return groupName;
  }

  return undefined;
}

// eslint-disable-next-line complexity -- this is a complex function that needs to be refactored
export function isPositionInComment(model: Monaco.editor.ITextModel, position: Monaco.Position): boolean {
  const line = model.getLineContent(position.lineNumber);
  const column = position.column - 1; // Convert to 0-based

  // Check for single-line comment: //
  const singleLineCommentIndex = line.indexOf('//');
  if (singleLineCommentIndex !== -1 && column >= singleLineCommentIndex) {
    return true;
  }

  // Check for multi-line comment: /* ... */
  // First, check if we're on a line that contains /* ... */ (single line block comment)
  const singleLineBlockMatch = /\/\*.*?\*\//.exec(line);
  if (singleLineBlockMatch) {
    const startIndex = singleLineBlockMatch.index;
    const endIndex = startIndex + singleLineBlockMatch[0].length;
    if (column >= startIndex && column < endIndex) {
      return true;
    }
  }

  // Check for multi-line block comments that span multiple lines
  const lines = model.getLinesContent();
  let inMultiLineComment = false;

  // Search backwards from current line to find if we're inside a multi-line comment
  for (let i = position.lineNumber - 1; i >= 0; i--) {
    const currentLine = lines[i];

    // Check if this line has /* without corresponding */
    const openCommentIndex = currentLine.lastIndexOf('/*');
    const closeCommentIndex = currentLine.lastIndexOf('*/');

    if (i === position.lineNumber - 1) {
      // On the current line, check position relative to comment markers
      if (openCommentIndex !== -1 && closeCommentIndex === -1) {
        // Line has /* but no */ - we're in a multi-line comment if position is after /*
        if (column >= openCommentIndex) {
          return true;
        }
      } else if (openCommentIndex === -1 && closeCommentIndex !== -1) {
        // Line has */ but no /* - we're in a multi-line comment if position is before */
        if (column <= closeCommentIndex + 1) {
          return true;
        }
      } else if (
        openCommentIndex !== -1 &&
        closeCommentIndex !== -1 && // Both /* and */ on current line
        openCommentIndex < closeCommentIndex && // /* comes before */ - check if position is between them
        column >= openCommentIndex &&
        column <= closeCommentIndex + 1
      ) {
        return true;
      }

      continue;
    }

    // On previous lines, check the pattern of /* and */
    if (openCommentIndex !== -1 && closeCommentIndex === -1) {
      // Found /* without */ - we're inside a multi-line comment
      inMultiLineComment = true;
      break;
    } else if (openCommentIndex === -1 && closeCommentIndex !== -1) {
      // Found */ without /* - end of multi-line comment, we're not inside
      break;
    } else if (openCommentIndex !== -1 && closeCommentIndex !== -1) {
      // Both /* and */ on this line
      if (openCommentIndex < closeCommentIndex) {
        // /* comes before */ - comment is closed on this line, continue searching
        continue;
      }

      // */ comes before /* - we're inside a multi-line comment
      inMultiLineComment = true;
      break;
    }
  }

  return inMultiLineComment;
}

export function findFunctionDeclaration(
  model: Monaco.editor.ITextModel,
  functionName: string,
): FunctionInfo | undefined {
  const lines = model.getLinesContent();

  // Pattern to match function declarations: function functionName(...) = ...;
  const functionPattern = new RegExp(`^\\s*function\\s+${escapeRegExp(functionName)}\\s*\\(([^)]*)\\)\\s*=`);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(functionPattern);

    if (match) {
      const commentInfo = extractCommentDescription(lines, i);
      const parametersString = match[1].trim();
      const parameters = parametersString ? parametersString.split(',').map((p) => p.trim()) : [];
      const signature = `function ${functionName}(${parametersString})`;

      return {
        name: functionName,
        lineNumber: i + 1,
        description: commentInfo.description,
        parameters,
        signature,
      };
    }
  }

  return undefined;
}

function parseVariableValue(input: string): string {
  let result = '';
  let depth = 0;
  let inString = false;
  let stringChar = '';

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    const previousChar = i > 0 ? input[i - 1] : '';

    // Handle string literals
    if (!inString && (char === '"' || char === "'")) {
      inString = true;
      stringChar = char;
      result += char;
    } else if (inString && char === stringChar && previousChar !== '\\') {
      inString = false;
      stringChar = '';
      result += char;
    } else if (inString) {
      result += char;
    }
    // Handle brackets and parentheses depth
    else if (char === '(' || char === '[' || char === '{') {
      depth++;
      result += char;
    } else if (char === ')' || char === ']' || char === '}') {
      depth--;
      result += char;
    }
    // Stop at comma or semicolon if we're at depth 0 (not inside nested structures)
    else if ((char === ',' || char === ';') && depth === 0) {
      break;
    }
    // Add other characters
    else {
      result += char;
    }
  }

  return result.trim();
}

export function findVariableDeclaration(
  model: Monaco.editor.ITextModel,
  variableName: string,
): VariableInfo | undefined {
  const lines = model.getLinesContent();

  // Pattern to match variable declarations: variableName = value; (stops at semicolon or comma)
  const variablePattern = new RegExp(`^\\s*${escapeRegExp(variableName)}\\s*=\\s*(.+)$`);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(variablePattern);

    if (match) {
      const rawValue = match[1];
      const value = parseVariableValue(rawValue); // Parse value correctly handling nested structures
      const commentInfo = extractCommentDescription(lines, i);

      return {
        name: variableName,
        value,
        description: commentInfo.description,
        group: commentInfo.group,
        lineNumber: i + 1,
        type: inferType(value),
      };
    }
  }

  return undefined;
}

function extractGroupFromLines(lines: string[], lineIndex: number): string | undefined {
  let currentLine = lineIndex - 1;

  while (currentLine >= 0) {
    const line = lines[currentLine];
    const trimmedLine = line.trim();

    // Skip empty lines
    if (trimmedLine === '') {
      currentLine--;
      continue;
    }

    // Check for group in block comment format: /* [GroupName] */
    if (trimmedLine.startsWith('/*') && trimmedLine.endsWith('*/')) {
      const groupMatch = /^\/\*\s*\[([^\]]+)]\s*\*\/$/.exec(trimmedLine);
      if (groupMatch) {
        return groupMatch[1];
      }
    }

    // Continue past comments and variable declarations to find the group header
    if (
      trimmedLine.startsWith('//') ||
      trimmedLine.startsWith('/*') ||
      trimmedLine.endsWith('*/') ||
      trimmedLine.startsWith('*') ||
      /^\s*\w+\s*=/.test(trimmedLine)
    ) {
      currentLine--;
      continue;
    }

    // Stop at module/function declarations or other significant boundaries
    if (trimmedLine.includes('module ') || trimmedLine.includes('function ')) {
      break;
    }

    currentLine--;
  }

  return undefined;
}

export function extractCommentDescription(
  lines: string[],
  lineIndex: number,
): { description?: string; group?: string } {
  // Look for comments in the lines before the variable declaration
  const commentLines: string[] = [];
  let currentLine = lineIndex - 1;

  while (currentLine >= 0) {
    const line = lines[currentLine];
    const trimmedLine = line.trim();

    // Skip empty lines - allow spaces between comments and declarations
    if (trimmedLine === '') {
      currentLine--;
      continue;
    }

    // Skip lines that start with block comment opening - these are typically section headers
    if (trimmedLine.startsWith('/*')) {
      break;
    }

    // Check for single-line comment
    if (trimmedLine.startsWith('//')) {
      const commentText = trimmedLine.slice(2).trim();
      if (commentText) {
        commentLines.unshift(commentText);
      }

      currentLine--;
    }
    // Check for multi-line comment end
    else if (trimmedLine.endsWith('*/')) {
      const multiLineComments: string[] = [];
      let inComment = true;

      // Extract the comment content from the current line
      if (trimmedLine.includes('/*')) {
        // Single line /* comment */
        const commentStart = trimmedLine.indexOf('/*');
        const commentContent = trimmedLine.slice(commentStart + 2, -2).trim();
        if (commentContent) {
          multiLineComments.unshift(commentContent);
        }

        // Add the multi-line comment to our collection and break
        commentLines.unshift(...multiLineComments);
        break;
      } else {
        // Multi-line comment, extract content before */
        const beforeEnd = trimmedLine.slice(0, -2).trim();
        if (beforeEnd) {
          multiLineComments.unshift(beforeEnd);
        }

        currentLine--;

        // Continue reading backwards until we find /*
        while (currentLine >= 0 && inComment) {
          const commentLine = lines[currentLine];
          const trimmedCommentLine = commentLine.trim();
          if (trimmedCommentLine.includes('/*')) {
            const commentStart = trimmedCommentLine.indexOf('/*');
            const commentContent = trimmedCommentLine.slice(commentStart + 2).trim();
            if (commentContent) {
              multiLineComments.unshift(commentContent);
            }

            inComment = false;
          } else {
            if (trimmedCommentLine) {
              multiLineComments.unshift(trimmedCommentLine);
            }

            currentLine--;
          }
        }
      }

      // Add the multi-line comment to our collection and break
      commentLines.unshift(...multiLineComments);
      break;
    }
    // Non-comment line breaks the comment chain
    else if (trimmedLine.startsWith('*')) {
      currentLine--;
    } else {
      break;
    }
  }

  // Join all comment lines with proper markdown line breaks to preserve formatting
  const description = commentLines.length > 0 ? commentLines.join('  \n') : undefined;
  const group = extractGroupFromLines(lines, lineIndex);

  return { description, group };
}

function inferType(value: string): string {
  // Remove whitespace
  const trimmed = value.trim();

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

  // Check for vectors
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return 'vector';
  }

  // Default to expression
  return 'expression';
}

export function escapeRegExp(string: string): string {
  return string.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

export function findModuleDeclaration(model: Monaco.editor.ITextModel, moduleName: string): ModuleInfo | undefined {
  const lines = model.getLinesContent();

  // Pattern to match module declarations: module moduleName(...) [optional modifiers like union()] {
  const modulePattern = new RegExp(`^\\s*module\\s+${escapeRegExp(moduleName)}\\s*\\(([^)]*)\\).*?\\{?\\s*$`);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(modulePattern);

    if (match) {
      const commentInfo = extractCommentDescription(lines, i);
      const parametersString = match[1].trim();
      const parameters = parametersString ? parametersString.split(',').map((p) => p.trim()) : [];
      const signature = `module ${moduleName}(${parametersString})`;

      return {
        name: moduleName,
        lineNumber: i + 1,
        description: commentInfo.description,
        parameters,
        signature,
      };
    }
  }

  return undefined;
}

export function findUserDefinedItems(model: Monaco.editor.ITextModel): {
  variables: Array<{ name: string; value: string; type?: string; description?: string }>;
  modules: Array<{ name: string; parameters: string[]; description?: string }>;
  functions: Array<{ name: string; parameters: string[]; description?: string }>;
} {
  const lines = model.getLinesContent();
  const variables: Array<{ name: string; value: string; type?: string; description?: string }> = [];
  const modules: Array<{ name: string; parameters: string[]; description?: string }> = [];
  const functions: Array<{ name: string; parameters: string[]; description?: string }> = [];

  // Patterns for different declarations
  const variablePattern = /^\s*([a-zA-Z_]\w*)\s*=\s*(.+)$/;
  const modulePattern = /^\s*module\s+([a-zA-Z_]\w*)\s*\(([^)]*)\)/;
  const functionPattern = /^\s*function\s+([a-zA-Z_]\w*)\s*\(([^)]*)\)\s*=/;

  for (const line of lines) {
    // Check for variable declarations
    const varMatch = variablePattern.exec(line);
    if (varMatch) {
      const name = varMatch[1];
      const value = varMatch[2].trim();

      // Don't duplicate if we already found this variable
      if (!variables.some((v) => v.name === name)) {
        const varInfo = findVariableDeclaration(model, name);
        variables.push({
          name,
          value,
          type: varInfo?.type,
          description: varInfo?.description,
        });
      }
    }

    // Check for module declarations
    const moduleMatch = modulePattern.exec(line);
    if (moduleMatch) {
      const name = moduleMatch[1];

      if (!modules.some((m) => m.name === name)) {
        const moduleInfo = findModuleDeclaration(model, name);
        if (moduleInfo) {
          modules.push({
            name,
            parameters: moduleInfo.parameters,
            description: moduleInfo.description,
          });
        }
      }
    }

    // Check for function declarations
    const functionMatch = functionPattern.exec(line);
    if (functionMatch) {
      const name = functionMatch[1];

      if (!functions.some((f) => f.name === name)) {
        const functionInfo = findFunctionDeclaration(model, name);
        if (functionInfo) {
          functions.push({
            name,
            parameters: functionInfo.parameters,
            description: functionInfo.description,
          });
        }
      }
    }
  }

  return { variables, modules, functions };
}

export function inferParameterType(
  defaultValue: string | undefined,
): 'number' | 'boolean' | 'string' | 'array' | 'any' {
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

export function findFunctionCall(
  model: Monaco.editor.ITextModel,
  position: Monaco.Position,
):
  | { functionName: string; parameterIndex: number; startPosition: Pick<Monaco.Position, 'lineNumber' | 'column'> }
  | undefined {
  const lines = model.getLinesContent();
  const currentLineIndex = position.lineNumber - 1;
  let searchPos = position.column - 1; // Start from current position
  let parenDepth = 0;
  let functionName = '';

  // Search backwards to find the opening parenthesis and function name
  let currentLine = currentLineIndex;
  while (currentLine >= 0) {
    const line = lines[currentLine];
    const startPos = currentLine === currentLineIndex ? searchPos : line.length;

    for (let i = startPos - 1; i >= 0; i--) {
      const char = line[i];

      if (char === ')') {
        parenDepth++;
      } else if (char === '(') {
        if (parenDepth === 0) {
          // Found the opening parenthesis, now find the function name
          let nameEnd = i - 1;
          let nameLineIndex = currentLine;

          // Skip whitespace
          while (nameLineIndex >= 0) {
            const nameLine = lines[nameLineIndex];
            const searchStart = nameLineIndex === currentLine ? nameEnd : nameLine.length - 1;

            let found = false;
            for (let j = searchStart; j >= 0; j--) {
              if (!/\s/.test(nameLine[j])) {
                nameEnd = j;
                found = true;
                break;
              }
            }

            if (found) break;
            nameLineIndex--;
            nameEnd = nameLineIndex >= 0 ? lines[nameLineIndex].length - 1 : -1;
          }

          if (nameLineIndex < 0) break;

          // Extract function name
          const nameLine = lines[nameLineIndex];
          let nameStart = nameEnd;
          while (nameStart >= 0 && /\w/.test(nameLine[nameStart])) {
            nameStart--;
          }

          if (nameStart < nameEnd) {
            functionName = nameLine.slice(nameStart + 1, nameEnd + 1);

            // Count parameters by counting commas between opening paren and cursor
            // Start from the opening parenthesis and count forward to current position
            const parameterIndex = countParametersFromParenToCursor(
              model,
              { lineNumber: currentLine + 1, column: i + 1 },
              position,
            );

            return {
              functionName,
              parameterIndex,
              startPosition: { lineNumber: currentLine + 1, column: i + 1 },
            };
          }
        } else {
          parenDepth--;
        }
      }
    }

    if (functionName) break;
    currentLine--;
    searchPos = currentLine >= 0 ? lines[currentLine].length : 0;
  }

  return undefined;
}

function countParametersFromParenToCursor(
  model: Monaco.editor.ITextModel,
  openParenPosition: Pick<Monaco.Position, 'lineNumber' | 'column'>,
  cursorPosition: Pick<Monaco.Position, 'lineNumber' | 'column'>,
): number {
  const text = model.getValueInRange({
    startLineNumber: openParenPosition.lineNumber,
    startColumn: openParenPosition.column + 1, // Skip the opening paren
    endLineNumber: cursorPosition.lineNumber,
    endColumn: cursorPosition.column,
  });

  let parameterIndex = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  let inString = false;
  let stringChar = '';

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const previousChar = i > 0 ? text[i - 1] : '';

    // Handle string literals
    if (!inString && (char === '"' || char === "'")) {
      inString = true;
      stringChar = char;
    } else if (inString && char === stringChar && previousChar !== '\\') {
      inString = false;
      stringChar = '';
    } else if (inString) {
      continue; // Skip everything inside strings
    }
    // Handle brackets and parentheses depth
    else if (char === '(' || char === '[') {
      if (char === '(') parenDepth++;
      else bracketDepth++;
    } else if (char === ')' || char === ']') {
      if (char === ')') parenDepth--;
      else bracketDepth--;
    }
    // Count commas only at depth 0 (not inside nested structures)
    else if (char === ',' && parenDepth === 0 && bracketDepth === 0) {
      parameterIndex++;
    }
  }

  return parameterIndex;
}

// eslint-disable-next-line complexity -- TODO: refactor
export function findParameterCompletions(model: Monaco.editor.ITextModel, position: Monaco.Position): string[] {
  const lines = model.getLinesContent();
  const currentLineIndex = position.lineNumber - 1;
  let searchPos = position.column - 2; // Start before current position
  let parenDepth = 0;
  let functionName = '';

  // Search backwards to find the opening parenthesis and function name
  let currentLine = currentLineIndex;
  while (currentLine >= 0) {
    const line = lines[currentLine];
    const startPos = currentLine === currentLineIndex ? searchPos : line.length - 1;

    for (let i = startPos; i >= 0; i--) {
      const char = line[i];

      if (char === ')') {
        parenDepth++;
      } else if (char === '(') {
        if (parenDepth === 0) {
          // Found the opening parenthesis, extract function name
          let nameEnd = i - 1;
          let nameLineIndex = currentLine;

          // Skip whitespace
          while (nameLineIndex >= 0) {
            const nameLine = lines[nameLineIndex];
            const searchStart = nameLineIndex === currentLine ? nameEnd : nameLine.length - 1;

            let found = false;
            for (let j = searchStart; j >= 0; j--) {
              if (!/\s/.test(nameLine[j])) {
                nameEnd = j;
                found = true;
                break;
              }
            }

            if (found) break;
            nameLineIndex--;
            nameEnd = nameLineIndex >= 0 ? lines[nameLineIndex].length - 1 : -1;
          }

          if (nameLineIndex < 0) break;

          // Extract function name
          const nameLine = lines[nameLineIndex];
          let nameStart = nameEnd;
          while (nameStart >= 0 && /\w/.test(nameLine[nameStart])) {
            nameStart--;
          }

          if (nameStart < nameEnd) {
            functionName = nameLine.slice(nameStart + 1, nameEnd + 1);
            break;
          }
        } else {
          parenDepth--;
        }
      }
    }

    if (functionName) break;
    currentLine--;
    searchPos = currentLine >= 0 ? lines[currentLine].length - 1 : -1;
  }

  if (!functionName) {
    return [];
  }

  // Find parameters for this function/module
  const allBuiltIns = [...openscadSymbols, ...openscadFunctions];
  const builtIn = allBuiltIns.find((symbol) => symbol.name === functionName);

  if (builtIn && 'parameters' in builtIn && builtIn.parameters) {
    return builtIn.parameters.map((parameter) => parameter.name);
  }

  // Check user-defined modules/functions
  const moduleInfo = findModuleDeclaration(model, functionName);
  if (moduleInfo) {
    return moduleInfo.parameters.map((parameter) => {
      const [name] = parameter.includes('=') ? parameter.split('=').map((p) => p.trim()) : [parameter.trim()];
      return name;
    });
  }

  const functionInfo = findFunctionDeclaration(model, functionName);
  if (functionInfo) {
    return functionInfo.parameters.map((parameter) => {
      const [name] = parameter.includes('=') ? parameter.split('=').map((p) => p.trim()) : [parameter.trim()];
      return name;
    });
  }

  return [];
}
