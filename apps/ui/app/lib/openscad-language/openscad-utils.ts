import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api';

export type VariableInfo = {
  name: string;
  value: string;
  description?: string;
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
      const description = extractCommentDescription(lines, i);
      const parametersString = match[1].trim();
      const parameters = parametersString ? parametersString.split(',').map((p) => p.trim()) : [];
      const signature = `function ${functionName}(${parametersString})`;

      return {
        name: functionName,
        lineNumber: i + 1,
        description,
        parameters,
        signature,
      };
    }
  }

  return undefined;
}

export function findVariableDeclaration(
  model: Monaco.editor.ITextModel,
  variableName: string,
): VariableInfo | undefined {
  const lines = model.getLinesContent();

  // Pattern to match variable declarations: variableName = value; (stops at semicolon)
  const variablePattern = new RegExp(`^\\s*${escapeRegExp(variableName)}\\s*=\\s*([^;]+);?`);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(variablePattern);

    if (match) {
      const value = match[1].trim(); // Value up to semicolon, trimmed
      const description = extractCommentDescription(lines, i);

      return {
        name: variableName,
        value,
        description,
        lineNumber: i + 1,
        type: inferType(value),
      };
    }
  }

  return undefined;
}

export function extractCommentDescription(lines: string[], lineIndex: number): string | undefined {
  // Look for comments in the lines before the variable declaration
  let description = '';
  let currentLine = lineIndex - 1;

  while (currentLine >= 0) {
    const line = lines[currentLine].trim();

    // Check for single-line comment
    if (line.startsWith('//')) {
      const commentText = line.slice(2).trim();
      description = commentText + (description ? '\n' + description : '');
      currentLine--;
    }
    // Check for multi-line comment end
    else if (line.endsWith('*/')) {
      const commentLines: string[] = [];
      let inComment = true;

      // Extract the comment content from the current line
      if (line.includes('/*')) {
        // Single line /* comment */
        const commentStart = line.indexOf('/*');
        const commentContent = line.slice(commentStart + 2, -2).trim();
        if (commentContent) {
          commentLines.unshift(commentContent);
        }

        break;
      } else {
        // Multi-line comment, extract content before */
        const beforeEnd = line.slice(0, -2).trim();
        if (beforeEnd) {
          commentLines.unshift(beforeEnd);
        }

        currentLine--;

        // Continue reading backwards until we find /*
        while (currentLine >= 0 && inComment) {
          const commentLine = lines[currentLine];
          if (commentLine.includes('/*')) {
            const commentStart = commentLine.indexOf('/*');
            const commentContent = commentLine.slice(commentStart + 2).trim();
            if (commentContent) {
              commentLines.unshift(commentContent);
            }

            inComment = false;
          } else {
            const trimmed = commentLine.trim();
            if (trimmed) {
              commentLines.unshift(trimmed);
            }

            currentLine--;
          }
        }
      }

      description = commentLines.join('\n') + (description ? '\n' + description : '');
      break;
    }
    // Empty line or non-comment line breaks the comment chain
    else if (line === '' || !line.startsWith('*')) {
      break;
    } else {
      currentLine--;
    }
  }

  return description || undefined;
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

  // Check for arrays
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return 'array';
  }

  // Default to expression
  return 'expression';
}

export function escapeRegExp(string: string): string {
  return string.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

export function findModuleDeclaration(model: Monaco.editor.ITextModel, moduleName: string): ModuleInfo | undefined {
  const lines = model.getLinesContent();

  // Pattern to match module declarations: module moduleName(...) {
  const modulePattern = new RegExp(`^\\s*module\\s+${escapeRegExp(moduleName)}\\s*\\(([^)]*)\\)\\s*\\{?\\s*$`);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(modulePattern);

    if (match) {
      const description = extractCommentDescription(lines, i);
      const parametersString = match[1].trim();
      const parameters = parametersString ? parametersString.split(',').map((p) => p.trim()) : [];
      const signature = `module ${moduleName}(${parametersString})`;

      return {
        name: moduleName,
        lineNumber: i + 1,
        description,
        parameters,
        signature,
      };
    }
  }

  return undefined;
}
