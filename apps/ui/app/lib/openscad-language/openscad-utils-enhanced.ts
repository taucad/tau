/**
 * Enhanced OpenSCAD utilities with tree-sitter integration
 * This file provides the same API as openscad-utils.ts but uses tree-sitter when available
 */

import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { getTreeSitterAdapter, type ParseResult } from './openscad-tree-sitter-adapter.js';

// Re-export the original types for compatibility
export type { VariableInfo, ModuleInfo, FunctionInfo } from './openscad-utils.js';

// Enhanced types
export type EnhancedParseResult = ParseResult & {
  parseMethod: 'tree-sitter' | 'manual';
};

/**
 * Enhanced function to find user-defined items using tree-sitter when available
 */
export async function findUserDefinedItemsEnhanced(model: Monaco.editor.ITextModel): Promise<{
  variables: Array<{ name: string; value: string; type?: string; description?: string }>;
  modules: Array<{ name: string; parameters: string[]; description?: string }>;
  functions: Array<{ name: string; parameters: string[]; description?: string }>;
  parseMethod: 'tree-sitter' | 'manual';
}> {
  const adapter = getTreeSitterAdapter();
  const code = model.getValue();
  const result = await adapter.parseCode(code);

  return {
    variables: result.variables.map(v => ({
      name: v.name,
      value: v.value,
      type: v.type,
      description: v.description
    })),
    modules: result.modules.map(m => ({
      name: m.name,
      parameters: m.parameters,
      description: m.description
    })),
    functions: result.functions.map(f => ({
      name: f.name,
      parameters: f.parameters,
      description: f.description
    })),
    parseMethod: result.usingTreeSitter ? 'tree-sitter' : 'manual'
  };
}

/**
 * Enhanced function to find variable declaration using tree-sitter when available
 */
export async function findVariableDeclarationEnhanced(
  model: Monaco.editor.ITextModel,
  variableName: string
): Promise<{
  name: string;
  value: string;
  description?: string;
  group?: string;
  lineNumber: number;
  type?: string;
  startColumn?: number;
  endColumn?: number;
  parseMethod: 'tree-sitter' | 'manual';
} | undefined> {
  const adapter = getTreeSitterAdapter();
  const code = model.getValue();
  const result = await adapter.parseCode(code);

  const variable = result.variables.find(v => v.name === variableName);
  if (!variable) return undefined;

  return {
    ...variable,
    parseMethod: result.usingTreeSitter ? 'tree-sitter' : 'manual'
  };
}

/**
 * Enhanced function to find module declaration using tree-sitter when available
 */
export async function findModuleDeclarationEnhanced(
  model: Monaco.editor.ITextModel,
  moduleName: string
): Promise<{
  name: string;
  lineNumber: number;
  description?: string;
  parameters: string[];
  signature: string;
  startColumn?: number;
  endColumn?: number;
  parseMethod: 'tree-sitter' | 'manual';
} | undefined> {
  const adapter = getTreeSitterAdapter();
  const code = model.getValue();
  const result = await adapter.parseCode(code);

  const module = result.modules.find(m => m.name === moduleName);
  if (!module) return undefined;

  return {
    ...module,
    parseMethod: result.usingTreeSitter ? 'tree-sitter' : 'manual'
  };
}

/**
 * Enhanced function to find function declaration using tree-sitter when available
 */
export async function findFunctionDeclarationEnhanced(
  model: Monaco.editor.ITextModel,
  functionName: string
): Promise<{
  name: string;
  lineNumber: number;
  description?: string;
  parameters: string[];
  signature: string;
  startColumn?: number;
  endColumn?: number;
  parseMethod: 'tree-sitter' | 'manual';
} | undefined> {
  const adapter = getTreeSitterAdapter();
  const code = model.getValue();
  const result = await adapter.parseCode(code);

  const func = result.functions.find(f => f.name === functionName);
  if (!func) return undefined;

  return {
    ...func,
    parseMethod: result.usingTreeSitter ? 'tree-sitter' : 'manual'
  };
}

/**
 * Enhanced function to check if position is in comment using tree-sitter when available
 */
export async function isPositionInCommentEnhanced(
  model: Monaco.editor.ITextModel,
  position: Monaco.Position
): Promise<boolean> {
  const adapter = getTreeSitterAdapter();
  const code = model.getValue();
  
  return await adapter.isPositionInComment(code, position);
}

/**
 * Enhanced function to find symbol at position using tree-sitter when available
 */
export async function findSymbolAtPositionEnhanced(
  model: Monaco.editor.ITextModel,
  position: Monaco.Position
): Promise<{
  symbol: any;
  parseMethod: 'tree-sitter' | 'manual';
} | null> {
  const adapter = getTreeSitterAdapter();
  const code = model.getValue();
  
  const symbol = await adapter.findSymbolAtPosition(code, position);
  
  if (!symbol) return null;
  
  return {
    symbol,
    parseMethod: 'tree-sitter' // If we get here, tree-sitter is working
  };
}

/**
 * Check if tree-sitter parsing is available
 */
export async function checkTreeSitterAvailability(): Promise<{
  available: boolean;
  message: string;
}> {
  const adapter = getTreeSitterAdapter();
  const testResult = await adapter.parseCode('// test');
  
  return {
    available: testResult.usingTreeSitter,
    message: testResult.usingTreeSitter 
      ? 'Tree-sitter parsing is available and working'
      : 'Tree-sitter parsing is not available, using manual parsing fallback'
  };
}

/**
 * Parse OpenSCAD code and return detailed analysis
 */
export async function analyzeOpenSCADCode(code: string): Promise<EnhancedParseResult> {
  const adapter = getTreeSitterAdapter();
  const result = await adapter.parseCode(code);
  
  return {
    ...result,
    parseMethod: result.usingTreeSitter ? 'tree-sitter' : 'manual'
  };
}

// Re-export functions from original utils for backwards compatibility
export {
  findCurrentModuleFunctionScope,
  findGroupName,
  extractCommentDescription,
  escapeRegExp,
  inferParameterType,
  findFunctionCall,
  findParameterCompletions
} from './openscad-utils.js';

// Enhanced versions that can use tree-sitter but fall back to manual parsing
export async function findUserDefinedItemsWithFallback(model: Monaco.editor.ITextModel) {
  try {
    return await findUserDefinedItemsEnhanced(model);
  } catch (error) {
    console.warn('Enhanced parsing failed, falling back to original:', error);
    // Import and use original function
    const { findUserDefinedItems } = await import('./openscad-utils.js');
    const result = findUserDefinedItems(model);
    return {
      ...result,
      parseMethod: 'manual' as const
    };
  }
}

export async function findVariableDeclarationWithFallback(
  model: Monaco.editor.ITextModel,
  variableName: string
) {
  try {
    return await findVariableDeclarationEnhanced(model, variableName);
  } catch (error) {
    console.warn('Enhanced variable search failed, falling back to original:', error);
    // Import and use original function
    const { findVariableDeclaration } = await import('./openscad-utils.js');
    const result = findVariableDeclaration(model, variableName);
    return result ? {
      ...result,
      parseMethod: 'manual' as const
    } : undefined;
  }
}

export async function findModuleDeclarationWithFallback(
  model: Monaco.editor.ITextModel,
  moduleName: string
) {
  try {
    return await findModuleDeclarationEnhanced(model, moduleName);
  } catch (error) {
    console.warn('Enhanced module search failed, falling back to original:', error);
    // Import and use original function
    const { findModuleDeclaration } = await import('./openscad-utils.js');
    const result = findModuleDeclaration(model, moduleName);
    return result ? {
      ...result,
      parseMethod: 'manual' as const
    } : undefined;
  }
}

export async function findFunctionDeclarationWithFallback(
  model: Monaco.editor.ITextModel,
  functionName: string
) {
  try {
    return await findFunctionDeclarationEnhanced(model, functionName);
  } catch (error) {
    console.warn('Enhanced function search failed, falling back to original:', error);
    // Import and use original function
    const { findFunctionDeclaration } = await import('./openscad-utils.js');
    const result = findFunctionDeclaration(model, functionName);
    return result ? {
      ...result,
      parseMethod: 'manual' as const
    } : undefined;
  }
}

export async function isPositionInCommentWithFallback(
  model: Monaco.editor.ITextModel,
  position: Monaco.Position
): Promise<boolean> {
  try {
    return await isPositionInCommentEnhanced(model, position);
  } catch (error) {
    console.warn('Enhanced comment detection failed, falling back to original:', error);
    // Import and use original function
    const { isPositionInComment } = await import('./openscad-utils.js');
    return isPositionInComment(model, position);
  }
}