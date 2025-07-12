/**
 * Tree-sitter adapter for OpenSCAD parsing
 * This provides enhanced parsing capabilities while maintaining backwards compatibility
 */

import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api';
import type { VariableInfo, ModuleInfo, FunctionInfo } from './openscad-utils.js';

// Enhanced types that extend the existing ones
export type EnhancedVariableInfo = VariableInfo & {
  startColumn?: number;
  endColumn?: number;
  node?: any;
};

export type EnhancedModuleInfo = ModuleInfo & {
  startColumn?: number;
  endColumn?: number;
  node?: any;
};

export type EnhancedFunctionInfo = FunctionInfo & {
  startColumn?: number;
  endColumn?: number;
  node?: any;
};

export type ParseResult = {
  variables: EnhancedVariableInfo[];
  modules: EnhancedModuleInfo[];
  functions: EnhancedFunctionInfo[];
  success: boolean;
  errors: Array<{
    message: string;
    line: number;
    column: number;
  }>;
  usingTreeSitter: boolean;
};

class OpenSCADTreeSitterAdapter {
  private parser: any = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize the tree-sitter parser
   */
  private async initializeParser(): Promise<void> {
    if (this.initialized) return;
    
    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    this.initPromise = this.doInitialize();
    await this.initPromise;
  }

  private async doInitialize(): Promise<void> {
    try {
      // TODO: Enable tree-sitter when package import issues are resolved
      // For now, we'll use the fallback parsing
      console.log('Tree-sitter parsing is not yet enabled, using fallback manual parsing');
      this.initialized = false;
      this.parser = null;
    } catch (error) {
      console.warn('Failed to initialize tree-sitter parser, falling back to manual parsing:', error);
      this.initialized = false;
      this.parser = null;
    }
  }

  /**
   * Parse OpenSCAD code using tree-sitter if available
   */
  async parseCode(code: string): Promise<ParseResult> {
    await this.initializeParser();

    if (!this.parser || !this.initialized) {
      // Fallback to manual parsing (we'll import it dynamically)
      return this.parseWithManualParser(code);
    }

    try {
      // Use tree-sitter parser
      const tree = this.parser.parse(code);
      
      // Extract information using tree-sitter queries
      const variables = this.extractVariablesFromTree(tree, code);
      const modules = this.extractModulesFromTree(tree, code);
      const functions = this.extractFunctionsFromTree(tree, code);

      return {
        variables,
        modules,
        functions,
        success: true,
        errors: [],
        usingTreeSitter: true
      };
    } catch (error) {
      console.warn('Tree-sitter parsing failed, falling back to manual parsing:', error);
      return this.parseWithManualParser(code);
    }
  }

  /**
   * Fallback to manual parsing
   */
  private async parseWithManualParser(code: string): Promise<ParseResult> {
    try {
      // Import the manual parser
      const { parseOpenScad } = await import('./openscad-pseudoparser.js');
      const result = parseOpenScad('', code, false);

      // Convert to our enhanced format
      const variables: EnhancedVariableInfo[] = result.vars.map(varName => ({
        name: varName,
        value: '',
        lineNumber: 1,
        type: 'unknown'
      }));

      const modules: EnhancedModuleInfo[] = Object.values(result.modules).map(module => ({
        name: module.name,
        lineNumber: 1,
        parameters: module.params?.map(p => `${p.name}${p.defaultValue ? ` = ${p.defaultValue}` : ''}`) || [],
        signature: module.signature
      }));

      const functions: EnhancedFunctionInfo[] = Object.values(result.functions).map(func => ({
        name: func.name,
        lineNumber: 1,
        parameters: func.params?.map(p => `${p.name}${p.defaultValue ? ` = ${p.defaultValue}` : ''}`) || [],
        signature: func.signature
      }));

      return {
        variables,
        modules,
        functions,
        success: true,
        errors: [],
        usingTreeSitter: false
      };
    } catch (error) {
      console.error('Manual parsing also failed:', error);
      return {
        variables: [],
        modules: [],
        functions: [],
        success: false,
        errors: [{ message: 'Parsing failed', line: 1, column: 1 }],
        usingTreeSitter: false
      };
    }
  }

  /**
   * Extract variables from tree-sitter tree
   */
  private extractVariablesFromTree(tree: any, code: string): EnhancedVariableInfo[] {
    const variables: EnhancedVariableInfo[] = [];
    
    if (!this.parser) return variables;

    try {
      // Use the tree-sitter queries to find variables
      const matches = this.parser.findVariables?.(code) || [];
      
      for (const match of matches) {
        if (match.captures) {
          const nameCapture = match.captures.find((c: any) => c.name === 'variable.name');
          const valueCapture = match.captures.find((c: any) => c.name === 'variable.value');
          
          if (nameCapture && valueCapture) {
            variables.push({
              name: nameCapture.node.text,
              value: valueCapture.node.text,
              lineNumber: nameCapture.node.startPosition.row + 1,
              startColumn: nameCapture.node.startPosition.column + 1,
              endColumn: nameCapture.node.endPosition.column + 1,
              type: this.inferType(valueCapture.node.text),
              node: nameCapture.node
            });
          }
        }
      }
    } catch (error) {
      console.warn('Failed to extract variables from tree:', error);
    }

    return variables;
  }

  /**
   * Extract modules from tree-sitter tree
   */
  private extractModulesFromTree(tree: any, code: string): EnhancedModuleInfo[] {
    const modules: EnhancedModuleInfo[] = [];
    
    if (!this.parser) return modules;

    try {
      // Use the tree-sitter queries to find modules
      const matches = this.parser.findModules?.(code) || [];
      
      for (const match of matches) {
        if (match.captures) {
          const nameCapture = match.captures.find((c: any) => c.name === 'module.name');
          const parametersCapture = match.captures.find((c: any) => c.name === 'module.parameters');
          
          if (nameCapture) {
            const parameters = parametersCapture ? this.extractParametersFromNode(parametersCapture.node) : [];
            
            modules.push({
              name: nameCapture.node.text,
              lineNumber: nameCapture.node.startPosition.row + 1,
              startColumn: nameCapture.node.startPosition.column + 1,
              endColumn: nameCapture.node.endPosition.column + 1,
              parameters,
              signature: `module ${nameCapture.node.text}(${parameters.join(', ')})`,
              node: nameCapture.node
            });
          }
        }
      }
    } catch (error) {
      console.warn('Failed to extract modules from tree:', error);
    }

    return modules;
  }

  /**
   * Extract functions from tree-sitter tree
   */
  private extractFunctionsFromTree(tree: any, code: string): EnhancedFunctionInfo[] {
    const functions: EnhancedFunctionInfo[] = [];
    
    if (!this.parser) return functions;

    try {
      // Use the tree-sitter queries to find functions
      const matches = this.parser.findFunctions?.(code) || [];
      
      for (const match of matches) {
        if (match.captures) {
          const nameCapture = match.captures.find((c: any) => c.name === 'function.name');
          const parametersCapture = match.captures.find((c: any) => c.name === 'function.parameters');
          
          if (nameCapture) {
            const parameters = parametersCapture ? this.extractParametersFromNode(parametersCapture.node) : [];
            
            functions.push({
              name: nameCapture.node.text,
              lineNumber: nameCapture.node.startPosition.row + 1,
              startColumn: nameCapture.node.startPosition.column + 1,
              endColumn: nameCapture.node.endPosition.column + 1,
              parameters,
              signature: `function ${nameCapture.node.text}(${parameters.join(', ')})`,
              node: nameCapture.node
            });
          }
        }
      }
    } catch (error) {
      console.warn('Failed to extract functions from tree:', error);
    }

    return functions;
  }

  /**
   * Check if a position is within a comment
   */
  async isPositionInComment(code: string, position: Monaco.Position): Promise<boolean> {
    await this.initializeParser();
    
    if (!this.parser || !this.initialized) {
      // Fallback to manual comment detection
      const { isPositionInComment } = await import('./openscad-utils.js');
      const model = { getLinesContent: () => code.split('\n'), getLineContent: (n: number) => code.split('\n')[n - 1] || '' } as any;
      return isPositionInComment(model, position);
    }

    try {
      // Use tree-sitter to check for comments
      const tree = this.parser.parse(code);
      const node = tree.rootNode.descendantForPosition({
        row: position.lineNumber - 1,
        column: position.column - 1
      });
      
      return node?.type === 'comment' || node?.type === 'block_comment';
    } catch (error) {
      console.warn('Failed to check comment position with tree-sitter:', error);
      return false;
    }
  }

  /**
   * Find symbol at position
   */
  async findSymbolAtPosition(code: string, position: Monaco.Position): Promise<any> {
    await this.initializeParser();
    
    if (!this.parser || !this.initialized) {
      return null;
    }

    try {
      const tree = this.parser.parse(code);
      const node = tree.rootNode.descendantForPosition({
        row: position.lineNumber - 1,
        column: position.column - 1
      });
      
      return node?.type === 'identifier' ? node : null;
    } catch (error) {
      console.warn('Failed to find symbol at position:', error);
      return null;
    }
  }

  private extractParametersFromNode(node: any): string[] {
    const parameters: string[] = [];
    
    if (!node) return parameters;
    
    try {
      // Extract parameter information from the node
      for (const child of node.children || []) {
        if (child.type === 'parameter' || child.type === 'identifier') {
          parameters.push(child.text);
        }
      }
    } catch (error) {
      console.warn('Failed to extract parameters from node:', error);
    }
    
    return parameters;
  }

  private inferType(value: string): string {
    const trimmed = value.trim();

    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      return 'number';
    }

    if (trimmed === 'true' || trimmed === 'false') {
      return 'boolean';
    }

    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || 
        (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
      return 'string';
    }

    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      return 'vector';
    }

    return 'expression';
  }
}

// Singleton instance
let adapterInstance: OpenSCADTreeSitterAdapter | null = null;

/**
 * Get the global tree-sitter adapter instance
 */
export function getTreeSitterAdapter(): OpenSCADTreeSitterAdapter {
  if (!adapterInstance) {
    adapterInstance = new OpenSCADTreeSitterAdapter();
  }
  return adapterInstance;
}

/**
 * Parse OpenSCAD code using tree-sitter when available
 */
export async function parseOpenSCADWithTreeSitter(code: string): Promise<ParseResult> {
  const adapter = getTreeSitterAdapter();
  return await adapter.parseCode(code);
}

/**
 * Check if tree-sitter is available and working
 */
export async function isTreeSitterAvailable(): Promise<boolean> {
  const adapter = getTreeSitterAdapter();
  const result = await adapter.parseCode('// test');
  return result.usingTreeSitter;
}