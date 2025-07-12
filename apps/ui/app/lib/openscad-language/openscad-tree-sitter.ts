// Simple types for the tree-sitter parser
type ParseResult = {
  tree: any;
  variables: TreeSitterVariableInfo[];
  modules: TreeSitterModuleInfo[];
  functions: TreeSitterFunctionInfo[];
  success: boolean;
  errors: Array<{
    message: string;
    line: number;
    column: number;
  }>;
};

type ParserInstance = {
  parse(code: string): any;
  findModules(code: string): any[];
  findFunctions(code: string): any[];
  findVariables(code: string): any[];
  findSymbolAtPosition(code: string, row: number, column: number): any;
};

export type TreeSitterVariableInfo = {
  name: string;
  value: string;
  description?: string;
  group?: string;
  lineNumber: number;
  type?: string;
  startColumn: number;
  endColumn: number;
};

export type TreeSitterModuleInfo = {
  name: string;
  lineNumber: number;
  description?: string;
  parameters: string[];
  signature: string;
  startColumn: number;
  endColumn: number;
};

export type TreeSitterFunctionInfo = {
  name: string;
  lineNumber: number;
  description?: string;
  parameters: string[];
  signature: string;
  startColumn: number;
  endColumn: number;
};

export type TreeSitterParseResult = ParseResult;

export class OpenSCADTreeSitterParser {
  private parser: ParserInstance | null = null;
  private initialized = false;

  constructor() {
    this.initializeParser();
  }

  private async initializeParser(): Promise<void> {
    if (this.initialized) return;

    try {
      // Use the createOpenSCADParser function from the documentation
      const { createOpenSCADParser } = await import('@holistic-stack/tree-sitter-openscad');
      this.parser = createOpenSCADParser();
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize OpenSCAD tree-sitter parser:', error);
      throw error;
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initializeParser();
    }
  }

  /**
   * Parse OpenSCAD code and return comprehensive analysis
   */
  async parse(code: string): Promise<TreeSitterParseResult> {
    await this.ensureInitialized();
    
    if (!this.parser || !this.language) {
      throw new Error('Parser not initialized');
    }

    const tree = this.parser.parse(code);
    const result: TreeSitterParseResult = {
      tree,
      variables: [],
      modules: [],
      functions: [],
      success: true,
      errors: []
    };

    // Extract syntax errors
    result.errors = this.extractSyntaxErrors(tree);
    result.success = result.errors.length === 0;

    // Extract variables
    result.variables = await this.extractVariables(tree, code);

    // Extract modules
    result.modules = await this.extractModules(tree, code);

    // Extract functions
    result.functions = await this.extractFunctions(tree, code);

    return result;
  }

  /**
   * Find all variable declarations in the code
   */
  async extractVariables(tree: Parser.Tree, code: string): Promise<TreeSitterVariableInfo[]> {
    await this.ensureInitialized();
    
    if (!this.language) {
      throw new Error('Language not initialized');
    }

    const variables: TreeSitterVariableInfo[] = [];
    const lines = code.split('\n');

    // Query for variable assignments
    const query = this.language.query(`
      (assignment_statement
        name: (identifier) @variable.name
        value: (_) @variable.value) @variable.definition
    `);

    const matches = query.matches(tree.rootNode);

    for (const match of matches) {
      const nameCapture = match.captures.find(c => c.name === 'variable.name');
      const valueCapture = match.captures.find(c => c.name === 'variable.value');

      if (nameCapture && valueCapture) {
        const name = nameCapture.node.text;
        const value = valueCapture.node.text;
        const lineNumber = nameCapture.node.startPosition.row + 1;
        const startColumn = nameCapture.node.startPosition.column + 1;
        const endColumn = nameCapture.node.endPosition.column + 1;

        // Extract comment description
        const description = this.extractCommentDescription(lines, lineNumber - 1);

        variables.push({
          name,
          value,
          description,
          lineNumber,
          startColumn,
          endColumn,
          type: this.inferType(value)
        });
      }
    }

    return variables;
  }

  /**
   * Find all module definitions in the code
   */
  async extractModules(tree: Parser.Tree, code: string): Promise<TreeSitterModuleInfo[]> {
    await this.ensureInitialized();
    
    if (!this.language) {
      throw new Error('Language not initialized');
    }

    const modules: TreeSitterModuleInfo[] = [];
    const lines = code.split('\n');

    // Query for module definitions
    const query = this.language.query(`
      (module_definition
        name: (identifier) @module.name
        parameters: (parameter_list)? @module.parameters
        body: (block) @module.body) @module.definition
    `);

    const matches = query.matches(tree.rootNode);

    for (const match of matches) {
      const nameCapture = match.captures.find(c => c.name === 'module.name');
      const parametersCapture = match.captures.find(c => c.name === 'module.parameters');

      if (nameCapture) {
        const name = nameCapture.node.text;
        const lineNumber = nameCapture.node.startPosition.row + 1;
        const startColumn = nameCapture.node.startPosition.column + 1;
        const endColumn = nameCapture.node.endPosition.column + 1;

        // Extract parameters
        const parameters = parametersCapture 
          ? this.extractParameters(parametersCapture.node)
          : [];

        // Extract comment description
        const description = this.extractCommentDescription(lines, lineNumber - 1);

        const signature = `module ${name}(${parameters.join(', ')})`;

        modules.push({
          name,
          lineNumber,
          description,
          parameters,
          signature,
          startColumn,
          endColumn
        });
      }
    }

    return modules;
  }

  /**
   * Find all function definitions in the code
   */
  async extractFunctions(tree: Parser.Tree, code: string): Promise<TreeSitterFunctionInfo[]> {
    await this.ensureInitialized();
    
    if (!this.language) {
      throw new Error('Language not initialized');
    }

    const functions: TreeSitterFunctionInfo[] = [];
    const lines = code.split('\n');

    // Query for function definitions
    const query = this.language.query(`
      (function_definition
        name: (identifier) @function.name
        parameters: (parameter_list)? @function.parameters
        body: (_) @function.body) @function.definition
    `);

    const matches = query.matches(tree.rootNode);

    for (const match of matches) {
      const nameCapture = match.captures.find(c => c.name === 'function.name');
      const parametersCapture = match.captures.find(c => c.name === 'function.parameters');

      if (nameCapture) {
        const name = nameCapture.node.text;
        const lineNumber = nameCapture.node.startPosition.row + 1;
        const startColumn = nameCapture.node.startPosition.column + 1;
        const endColumn = nameCapture.node.endPosition.column + 1;

        // Extract parameters
        const parameters = parametersCapture 
          ? this.extractParameters(parametersCapture.node)
          : [];

        // Extract comment description
        const description = this.extractCommentDescription(lines, lineNumber - 1);

        const signature = `function ${name}(${parameters.join(', ')})`;

        functions.push({
          name,
          lineNumber,
          description,
          parameters,
          signature,
          startColumn,
          endColumn
        });
      }
    }

    return functions;
  }

  /**
   * Find symbol at a specific position (for hover, go-to-definition, etc.)
   */
  async findSymbolAtPosition(
    tree: Parser.Tree, 
    row: number, 
    column: number
  ): Promise<Parser.SyntaxNode | null> {
    await this.ensureInitialized();
    
    const point = { row, column };
    const node = tree.rootNode.descendantForPosition(point);
    
    // Look for identifier nodes
    if (node.type === 'identifier') {
      return node;
    }

    // Look for parent nodes that might be relevant
    let current = node.parent;
    while (current) {
      if (['module_definition', 'function_definition', 'assignment_statement', 'module_instantiation', 'call_expression'].includes(current.type)) {
        return current;
      }
      current = current.parent;
    }

    return null;
  }

  /**
   * Find all function calls in the code
   */
  async findFunctionCalls(tree: Parser.Tree, functionName?: string): Promise<Parser.QueryMatch[]> {
    await this.ensureInitialized();
    
    if (!this.language) {
      throw new Error('Language not initialized');
    }

    let queryString = `
      (call_expression
        function: (identifier) @function.name
        arguments: (argument_list)? @function.arguments) @function.call

      (module_instantiation
        name: (identifier) @module.name
        arguments: (argument_list)? @module.arguments) @module.call
    `;

    // Add function name filter if specified
    if (functionName) {
      queryString = `
        (call_expression
          function: (identifier) @function.name
          arguments: (argument_list)? @function.arguments
          (#eq? @function.name "${functionName}")) @function.call
      `;
    }

    const query = this.language.query(queryString);
    return query.matches(tree.rootNode);
  }

  /**
   * Check if a position is within a comment
   */
  async isPositionInComment(tree: Parser.Tree, row: number, column: number): Promise<boolean> {
    await this.ensureInitialized();
    
    const point = { row, column };
    const node = tree.rootNode.descendantForPosition(point);
    
    // Check if we're in a comment node
    return node.type === 'comment' || node.type === 'block_comment';
  }

  /**
   * Extract syntax errors from the parse tree
   */
  private extractSyntaxErrors(tree: Parser.Tree): Array<{message: string; line: number; column: number}> {
    const errors: Array<{message: string; line: number; column: number}> = [];
    
    const visitNode = (node: Parser.SyntaxNode) => {
      if (node.hasError) {
        errors.push({
          message: `Syntax error at ${node.type}`,
          line: node.startPosition.row + 1,
          column: node.startPosition.column + 1
        });
      }
      
      if (node.isMissing) {
        errors.push({
          message: `Missing ${node.type}`,
          line: node.startPosition.row + 1,
          column: node.startPosition.column + 1
        });
      }

      for (const child of node.children) {
        visitNode(child);
      }
    };

    visitNode(tree.rootNode);
    return errors;
  }

  /**
   * Extract parameters from a parameter list node
   */
  private extractParameters(parameterListNode: Parser.SyntaxNode): string[] {
    const parameters: string[] = [];
    
    for (const child of parameterListNode.children) {
      if (child.type === 'parameter_declaration') {
        parameters.push(child.text);
      } else if (child.type === 'identifier') {
        parameters.push(child.text);
      }
    }
    
    return parameters;
  }

  /**
   * Extract comment description from lines preceding a declaration
   */
  private extractCommentDescription(lines: string[], lineIndex: number): string | undefined {
    const commentLines: string[] = [];
    let currentLine = lineIndex - 1;

    while (currentLine >= 0) {
      const line = lines[currentLine];
      const trimmedLine = line.trim();

      // Skip empty lines
      if (trimmedLine === '') {
        currentLine--;
        continue;
      }

      // Check for single-line comment
      if (trimmedLine.startsWith('//')) {
        const commentText = trimmedLine.slice(2).trim();
        if (commentText) {
          commentLines.unshift(commentText);
        }
        currentLine--;
      }
      // Check for multi-line comment
      else if (trimmedLine.endsWith('*/')) {
        // Handle multi-line comments
        const commentStart = trimmedLine.indexOf('/*');
        if (commentStart !== -1) {
          const commentContent = trimmedLine.slice(commentStart + 2, -2).trim();
          if (commentContent) {
            commentLines.unshift(commentContent);
          }
        }
        break;
      }
      // Non-comment line breaks the chain
      else {
        break;
      }
    }

    return commentLines.length > 0 ? commentLines.join('  \n') : undefined;
  }

  /**
   * Infer the type of a value string
   */
  private inferType(value: string): string {
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
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || 
        (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
      return 'string';
    }

    // Check for vectors
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      return 'vector';
    }

    // Default to expression
    return 'expression';
  }
}

// Singleton instance
let parserInstance: OpenSCADTreeSitterParser | null = null;

/**
 * Get the global parser instance
 */
export function getOpenSCADParser(): OpenSCADTreeSitterParser {
  if (!parserInstance) {
    parserInstance = new OpenSCADTreeSitterParser();
  }
  return parserInstance;
}

/**
 * Parse OpenSCAD code and return analysis results
 */
export async function parseOpenSCAD(code: string): Promise<TreeSitterParseResult> {
  const parser = getOpenSCADParser();
  return await parser.parse(code);
}

/**
 * Find symbol at position for hover/definition providers
 */
export async function findSymbolAtPosition(
  code: string, 
  row: number, 
  column: number
): Promise<{
  node: Parser.SyntaxNode | null;
  tree: Parser.Tree;
}> {
  const parser = getOpenSCADParser();
  const result = await parser.parse(code);
  const node = await parser.findSymbolAtPosition(result.tree, row, column);
  
  return {
    node,
    tree: result.tree
  };
}