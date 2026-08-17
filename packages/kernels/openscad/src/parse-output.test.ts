import { describe, it, expect } from 'vitest';
import type { KernelIssue } from '@taucad/runtime/types';
import type { GetFileContentsFunction } from '#parse-output.js';
import { parseStderrLine, OpenScadStderrParser } from '#parse-output.js';

/**
 * Helper to create a GetFileContentsFunction from a map of file contents.
 */
function createGetFileContents(files: Record<string, string>): GetFileContentsFunction {
  return (fileName: string) => files[fileName];
}

describe('parseStderrLine', () => {
  describe('Parser errors', () => {
    it('should parse error format: ERROR: Parser error in file "X", line Y: message', () => {
      const errors: KernelIssue[] = [];
      parseStderrLine({
        message: 'ERROR: Parser error in file "main.scad", line 118: syntax error',
        addError(error) {
          errors.push(error);
        },
      });

      expect(errors).toHaveLength(1);
      expect(errors[0]).toEqual({
        message: 'syntax error',
        code: 'RUNTIME',
        location: {
          fileName: 'main.scad',
          startLineNumber: 118,
          startColumn: 1, // 1-based fallback
          endLineNumber: 118,
          endColumn: 1000,
        },
        type: 'compilation',
        severity: 'error',
      });
    });

    it('should parse error format: ERROR: Parser error: message in file X, line Y', () => {
      const errors: KernelIssue[] = [];
      parseStderrLine({
        message: 'ERROR: Parser error: syntax error in file /main.scad, line 118',
        addError(error) {
          errors.push(error);
        },
      });

      expect(errors).toHaveLength(1);
      expect(errors[0]).toEqual({
        message: 'syntax error',
        code: 'RUNTIME',
        location: {
          fileName: 'main.scad',
          startLineNumber: 118,
          startColumn: 1, // 1-based fallback
          endLineNumber: 118,
          endColumn: 1000,
        },
        type: 'compilation',
        severity: 'error',
      });
    });

    it('should strip leading slashes from filenames', () => {
      const errors: KernelIssue[] = [];
      parseStderrLine({
        message: 'ERROR: Parser error: syntax error in file /path/to/file.scad, line 10',
        addError(error) {
          errors.push(error);
        },
      });

      expect(errors).toHaveLength(1);
      expect(errors[0]?.location?.fileName).toBe('path/to/file.scad');
    });

    it('should parse += syntax errors (compound assignment not supported)', () => {
      // Real error from OpenSCAD when using += operator
      const errors: KernelIssue[] = [];
      parseStderrLine({
        message: 'ERROR: Parser error: syntax error in file /main.scad, line 118',
        addError(error) {
          errors.push(error);
        },
      });

      expect(errors).toHaveLength(1);
      expect(errors[0]?.location?.startLineNumber).toBe(118);
    });

    it('should parse errors with different file paths', () => {
      const errors: KernelIssue[] = [];
      parseStderrLine({
        message: 'ERROR: Parser error: unexpected token in file lib/utils.scad, line 42',
        addError(error) {
          errors.push(error);
        },
      });

      expect(errors).toHaveLength(1);
      expect(errors[0]?.location?.fileName).toBe('lib/utils.scad');
      expect(errors[0]?.location?.startLineNumber).toBe(42);
    });

    it('should map main file basename to full path when mainFilePath is provided', () => {
      const errors: KernelIssue[] = [];
      // When OpenSCAD reports error for "backyard.scad" but the main file is "site/backyard.scad"
      parseStderrLine({
        message: 'ERROR: Parser error: syntax error in file /backyard.scad, line 10',
        addError(error) {
          errors.push(error);
        },
        mainFilePath: 'site/backyard.scad', // MainFilePath
      });

      expect(errors).toHaveLength(1);
      // Should map basename to full path
      expect(errors[0]?.location?.fileName).toBe('site/backyard.scad');
    });

    it('should not map included file paths when mainFilePath is provided', () => {
      const errors: KernelIssue[] = [];
      // Error in an included file - should not be mapped to mainFilePath
      parseStderrLine({
        message: 'ERROR: Parser error: syntax error in file /lib/broken.scad, line 5',
        addError(error) {
          errors.push(error);
        },
        mainFilePath: 'site/main.scad', // MainFilePath (different file)
      });

      expect(errors).toHaveLength(1);
      // Should preserve the included file's path, not map to mainFilePath
      expect(errors[0]?.location?.fileName).toBe('lib/broken.scad');
    });

    it('should map warnings to full path when mainFilePath is provided', () => {
      const errors: KernelIssue[] = [];
      parseStderrLine({
        message: "WARNING: Ignoring unknown module 'foo' in file main.scad, line 5",
        addError(error) {
          errors.push(error);
        },
        mainFilePath: 'site/main.scad', // MainFilePath
      });

      expect(errors).toHaveLength(1);
      expect(errors[0]?.location?.fileName).toBe('site/main.scad');
    });
  });

  describe('Column positions from file contents (1-based)', () => {
    it('should use line content to set start and end columns', () => {
      const errorLine = 'x += 90 + 2*tray_clearance;';
      const getFileContents = createGetFileContents({
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Test file name
        'main.scad': `line 1\n${errorLine}\nline 3`,
      });

      const errors: KernelIssue[] = [];
      parseStderrLine({
        message: 'ERROR: Parser error: syntax error in file /main.scad, line 2',
        addError(error) {
          errors.push(error);
        },
        getFileContents,
      });

      expect(errors).toHaveLength(1);
      expect(errors[0]?.location).toEqual({
        fileName: 'main.scad',
        startLineNumber: 2,
        startColumn: 1, // 'x' is at 1-based column 1
        endLineNumber: 2,
        endColumn: errorLine.length + 1, // 1-based exclusive end
      });
    });

    it('should find first non-whitespace character for start column with indented code', () => {
      // Simulate indented error line like "    x += 90 + tray_clearance;"
      const errorLine = '    x += 90 + tray_clearance;';
      const getFileContents = createGetFileContents({
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Test file name
        'main.scad': `line 1\n${errorLine}\nline 3`,
      });

      const errors: KernelIssue[] = [];
      parseStderrLine({
        message: 'ERROR: Parser error: syntax error in file /main.scad, line 2',
        addError(error) {
          errors.push(error);
        },
        getFileContents,
      });

      expect(errors).toHaveLength(1);
      expect(errors[0]?.location).toEqual({
        fileName: 'main.scad',
        startLineNumber: 2,
        startColumn: 5, // 'x' is at 1-based column 5 (after 4 spaces)
        endLineNumber: 2,
        endColumn: errorLine.length + 1,
      });
    });

    it('should handle tabs as leading whitespace', () => {
      const errorLine = '\t\tx += 1;';
      const getFileContents = createGetFileContents({
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Test file name
        'main.scad': `line 1\n${errorLine}\nline 3`,
      });

      const errors: KernelIssue[] = [];
      parseStderrLine({
        message: 'ERROR: Parser error: syntax error in file /main.scad, line 2',
        addError(error) {
          errors.push(error);
        },
        getFileContents,
      });

      expect(errors).toHaveLength(1);
      expect(errors[0]?.location?.startColumn).toBe(3); // 'x' is at 1-based column 3 (after 2 tabs)
    });

    it('should fallback to 1000 when file is not in contents map', () => {
      const getFileContents = createGetFileContents({
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Test file name
        'other.scad': 'content',
      });

      const errors: KernelIssue[] = [];
      parseStderrLine({
        message: 'ERROR: Parser error: syntax error in file /main.scad, line 5',
        addError(error) {
          errors.push(error);
        },
        getFileContents,
      });

      expect(errors).toHaveLength(1);
      expect(errors[0]?.location?.startColumn).toBe(1); // 1-based fallback
      expect(errors[0]?.location?.endColumn).toBe(1000);
    });

    it('should fallback to 1000 when line number is out of range', () => {
      const getFileContents = createGetFileContents({
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Test file name
        'main.scad': 'line 1\nline 2',
      });

      const errors: KernelIssue[] = [];
      parseStderrLine({
        message: 'ERROR: Parser error: syntax error in file /main.scad, line 99',
        addError(error) {
          errors.push(error);
        },
        getFileContents,
      });

      expect(errors).toHaveLength(1);
      expect(errors[0]?.location?.startColumn).toBe(1); // 1-based fallback
      expect(errors[0]?.location?.endColumn).toBe(1000);
    });

    it('should handle empty file content without fallback', () => {
      // Empty string is valid content (file exists but is empty)
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Test file name
      const getFileContents = createGetFileContents({ 'main.scad': '' });

      const errors: KernelIssue[] = [];
      parseStderrLine({
        message: 'ERROR: Parser error: syntax error in file /main.scad, line 1',
        addError(error) {
          errors.push(error);
        },
        getFileContents,
      });

      expect(errors).toHaveLength(1);
      // Empty file has one empty line, so line 1 returns '' which gives startColumn=1, endColumn=1
      expect(errors[0]?.location).toEqual({
        fileName: 'main.scad',
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 1, // Not 1000 - empty string is valid content
      });
    });
  });

  describe('Warnings', () => {
    it('should parse warning format: WARNING: message in file X, line Y', () => {
      const errors: KernelIssue[] = [];
      parseStderrLine({
        message: 'WARNING: Undefined variable in file model.scad, line 42',
        addError(error) {
          errors.push(error);
        },
      });

      expect(errors).toHaveLength(1);
      expect(errors[0]?.message).toBe('Undefined variable');
      expect(errors[0]?.location?.fileName).toBe('model.scad');
      expect(errors[0]?.location?.startLineNumber).toBe(42);
      expect(errors[0]?.location?.endLineNumber).toBe(42);
      expect(errors[0]?.type).toBe('compilation');
    });

    it('should parse warnings with trailing period', () => {
      const errors: KernelIssue[] = [];
      parseStderrLine({
        message: 'WARNING: Variable shadowing, in file test.scad, line 10.',
        addError(error) {
          errors.push(error);
        },
      });

      expect(errors).toHaveLength(1);
      expect(errors[0]?.message).toBe('Variable shadowing');
    });

    it('should use actual line content for warnings when file contents provided', () => {
      const errorLine = 'undefined_var = x;';
      const getFileContents = createGetFileContents({
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Test file name
        'model.scad': `line 1\n${errorLine}\nline 3`,
      });

      const errors: KernelIssue[] = [];
      parseStderrLine({
        message: 'WARNING: Undefined variable in file model.scad, line 2',
        addError(error) {
          errors.push(error);
        },
        getFileContents,
      });

      expect(errors).toHaveLength(1);
      expect(errors[0]?.location?.startColumn).toBe(1); // 1-based column 1
      expect(errors[0]?.location?.endColumn).toBe(errorLine.length + 1);
    });

    it('should find start column for indented warning lines', () => {
      const errorLine = '  undefined_var = x;';
      const getFileContents = createGetFileContents({
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Test file name
        'model.scad': `line 1\n${errorLine}\nline 3`,
      });

      const errors: KernelIssue[] = [];
      parseStderrLine({
        message: 'WARNING: Undefined variable in file model.scad, line 2',
        addError(error) {
          errors.push(error);
        },
        getFileContents,
      });

      expect(errors).toHaveLength(1);
      expect(errors[0]?.location?.startColumn).toBe(3); // 1-based column 3 (after 2 spaces)
      expect(errors[0]?.location?.endColumn).toBe(errorLine.length + 1);
    });
  });

  describe('Severity detection', () => {
    it('should set severity to error for ERROR: Parser error patterns', () => {
      const errors: KernelIssue[] = [];
      parseStderrLine({
        message: 'ERROR: Parser error in file "main.scad", line 5: syntax error',
        addError(error) {
          errors.push(error);
        },
      });

      expect(errors).toHaveLength(1);
      expect(errors[0]?.severity).toBe('error');
    });

    it('should set severity to warning for WARNING: patterns', () => {
      const errors: KernelIssue[] = [];
      parseStderrLine({
        message: 'WARNING: Undefined variable in file main.scad, line 10',
        addError(error) {
          errors.push(error);
        },
      });

      expect(errors).toHaveLength(1);
      expect(errors[0]?.severity).toBe('warning');
    });

    it('should set severity to warning for undefined module warnings', () => {
      const errors: KernelIssue[] = [];
      parseStderrLine({
        message: "WARNING: Ignoring unknown module 'foo' in file main.scad, line 5",
        addError(error) {
          errors.push(error);
        },
      });

      expect(errors).toHaveLength(1);
      expect(errors[0]?.severity).toBe('warning');
      expect(errors[0]?.message).toContain('Ignoring unknown module');
    });

    it('should set severity to warning for undefined function warnings', () => {
      const errors: KernelIssue[] = [];
      parseStderrLine({
        message: "WARNING: Ignoring unknown function 'bar' in file main.scad, line 8",
        addError(error) {
          errors.push(error);
        },
      });

      expect(errors).toHaveLength(1);
      expect(errors[0]?.severity).toBe('warning');
    });
  });

  describe('TRACE line parsing (OpenScadStderrParser)', () => {
    it('should accumulate TRACE frames on the preceding error', () => {
      const errors: KernelIssue[] = [];
      const parser = new OpenScadStderrParser((error) => {
        errors.push(error);
      });

      // Simulate OpenSCAD stderr output: error followed by TRACE lines
      parser.parseLine("ERROR: Assertion 'false' failed in file /main.scad, line 6");
      parser.parseLine("TRACE: called by 'assert' in file /main.scad, line 6");
      parser.parseLine("TRACE: call of 'inner()' in file /main.scad, line 5");
      parser.parseLine("TRACE: called by 'inner' in file /main.scad, line 2");

      expect(errors).toEqual([
        {
          message: "Assertion 'false' failed",
          code: 'RUNTIME',
          type: 'runtime',
          severity: 'error',
          location: {
            fileName: 'main.scad',
            startLineNumber: 6,
            startColumn: 1,
            endLineNumber: 6,
            endColumn: 1000,
          },
          stackFrames: [
            {
              functionName: 'assert',
              fileName: 'main.scad',
              lineNumber: 6,
              context: 'framework',
            },
            {
              functionName: 'inner()',
              fileName: 'main.scad',
              lineNumber: 5,
              context: 'user',
            },
            {
              functionName: 'inner',
              fileName: 'main.scad',
              lineNumber: 2,
              context: 'user',
            },
          ],
        },
      ]);
    });

    it('should normalize file paths in TRACE frames', () => {
      const errors: KernelIssue[] = [];
      const parser = new OpenScadStderrParser((error) => {
        errors.push(error);
      });

      parser.parseLine("ERROR: Assertion 'false' failed in file /lib.scad, line 2");
      parser.parseLine("TRACE: called by 'assert' in file /lib.scad, line 2");
      parser.parseLine("TRACE: called by 'broken_module' in file /main.scad, line 3");

      expect(errors).toEqual([
        {
          message: "Assertion 'false' failed",
          code: 'RUNTIME',
          type: 'runtime',
          severity: 'error',
          location: {
            fileName: 'lib.scad',
            startLineNumber: 2,
            startColumn: 1,
            endLineNumber: 2,
            endColumn: 1000,
          },
          // Leading slashes should be stripped from file names
          stackFrames: [
            {
              functionName: 'assert',
              fileName: 'lib.scad',
              lineNumber: 2,
              context: 'framework',
            },
            {
              functionName: 'broken_module',
              fileName: 'main.scad',
              lineNumber: 3,
              context: 'user',
            },
          ],
        },
      ]);
    });

    it('should not attach TRACE frames to non-error lines', () => {
      const errors: KernelIssue[] = [];
      const parser = new OpenScadStderrParser((error) => {
        errors.push(error);
      });

      // TRACE lines without a preceding error should be silently ignored
      parser.parseLine("TRACE: called by 'assert' in file /main.scad, line 6");
      parser.parseLine("TRACE: called by 'inner' in file /main.scad, line 2");

      expect(errors).toEqual([]);
    });

    it('should not attach TRACE frames across non-trace intervening lines', () => {
      const errors: KernelIssue[] = [];
      const parser = new OpenScadStderrParser((error) => {
        errors.push(error);
      });

      // Error followed by a non-matching line, then a TRACE line
      parser.parseLine("ERROR: Assertion 'false' failed in file /main.scad, line 6");
      parser.parseLine('Compiling design (CSG Tree generation)...');
      parser.parseLine("TRACE: called by 'inner' in file /main.scad, line 2");

      // TRACE after non-trace line should NOT be attached to the error
      expect(errors).toEqual([
        {
          message: "Assertion 'false' failed",
          code: 'RUNTIME',
          type: 'runtime',
          severity: 'error',
          location: {
            fileName: 'main.scad',
            startLineNumber: 6,
            startColumn: 1,
            endLineNumber: 6,
            endColumn: 1000,
          },
        },
      ]);
    });

    it('should handle multiple errors with separate TRACE blocks', () => {
      const errors: KernelIssue[] = [];
      const parser = new OpenScadStderrParser((error) => {
        errors.push(error);
      });

      // First error with traces
      parser.parseLine("ERROR: Assertion 'false' failed in file /a.scad, line 1");
      parser.parseLine("TRACE: called by 'assert' in file /a.scad, line 1");
      parser.parseLine("TRACE: called by 'mod_a' in file /main.scad, line 5");

      // Second error with traces
      parser.parseLine("ERROR: Assertion 'false' failed in file /b.scad, line 3");
      parser.parseLine("TRACE: called by 'assert' in file /b.scad, line 3");

      expect(errors).toEqual([
        {
          message: "Assertion 'false' failed",
          code: 'RUNTIME',
          type: 'runtime',
          severity: 'error',
          location: {
            fileName: 'a.scad',
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: 1,
            endColumn: 1000,
          },
          stackFrames: [
            {
              functionName: 'assert',
              fileName: 'a.scad',
              lineNumber: 1,
              context: 'framework',
            },
            {
              functionName: 'mod_a',
              fileName: 'main.scad',
              lineNumber: 5,
              context: 'user',
            },
          ],
        },
        {
          message: "Assertion 'false' failed",
          code: 'RUNTIME',
          type: 'runtime',
          severity: 'error',
          location: {
            fileName: 'b.scad',
            startLineNumber: 3,
            startColumn: 1,
            endLineNumber: 3,
            endColumn: 1000,
          },
          stackFrames: [
            {
              functionName: 'assert',
              fileName: 'b.scad',
              lineNumber: 3,
              context: 'framework',
            },
          ],
        },
      ]);
    });

    it('should map main file basename in TRACE frames when mainFilePath is provided', () => {
      const errors: KernelIssue[] = [];
      const parser = new OpenScadStderrParser(
        (error) => {
          errors.push(error);
        },
        undefined,
        'site/backyard.scad',
      );

      parser.parseLine("ERROR: Assertion 'false' failed in file /lib.scad, line 2");
      parser.parseLine("TRACE: called by 'broken' in file /backyard.scad, line 3");

      expect(errors).toEqual([
        {
          message: "Assertion 'false' failed",
          code: 'RUNTIME',
          type: 'runtime',
          severity: 'error',
          location: {
            fileName: 'lib.scad',
            startLineNumber: 2,
            startColumn: 1,
            endLineNumber: 2,
            endColumn: 1000,
          },
          // Main file basename should map to full path in trace frame
          stackFrames: [
            {
              functionName: 'broken',
              fileName: 'site/backyard.scad',
              lineNumber: 3,
              context: 'user',
            },
          ],
        },
      ]);
    });
  });

  describe("Can't parse file include chain (OpenScadStderrParser)", () => {
    it('should create include stack frame from "Can\'t parse file" line', () => {
      const errors: KernelIssue[] = [];
      const parser = new OpenScadStderrParser((error) => {
        errors.push(error);
      });

      // Simulate: error in lib.scad, "Can't parse file 'main.scad'!"
      parser.parseLine('ERROR: Parser error: syntax error in file /lib.scad, line 2');
      parser.parseLine("Can't parse file 'main.scad'!");

      expect(errors).toEqual([
        {
          message: 'syntax error',
          code: 'RUNTIME',
          type: 'compilation',
          severity: 'error',
          location: {
            fileName: 'lib.scad',
            startLineNumber: 2,
            startColumn: 1,
            endLineNumber: 2,
            endColumn: 1000,
          },
          // Fallback line 1 (no file contents to search)
          stackFrames: [
            {
              functionName: 'include',
              fileName: 'main.scad',
              lineNumber: 1,
              context: 'user',
            },
          ],
        },
      ]);
    });

    it('should find correct include line when file contents are available', () => {
      const errors: KernelIssue[] = [];
      const getFileContents = createGetFileContents({
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Test file name
        'main.scad': '// Header\ninclude <lib.scad>\ncube([10, 10, 10]);',
      });
      const parser = new OpenScadStderrParser((error) => {
        errors.push(error);
      }, getFileContents);

      parser.parseLine('ERROR: Parser error: syntax error in file /lib.scad, line 5');
      parser.parseLine("Can't parse file 'main.scad'!");

      expect(errors).toEqual([
        {
          message: 'syntax error',
          code: 'RUNTIME',
          type: 'compilation',
          severity: 'error',
          location: {
            fileName: 'lib.scad',
            startLineNumber: 5,
            startColumn: 1,
            endLineNumber: 5,
            endColumn: 1000,
          },
          // Include is on line 2 of main.scad
          stackFrames: [
            {
              functionName: 'include',
              fileName: 'main.scad',
              lineNumber: 2,
              context: 'user',
            },
          ],
        },
      ]);
    });

    it('should reconstruct 3-file include chain from file contents', () => {
      const errors: KernelIssue[] = [];
      const getFileContents = createGetFileContents({
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Test file name
        'main.scad': 'include <middle.scad>\ncube([10, 10, 10]);',
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Test file name
        'middle.scad': 'include <bad.scad>\ny = 20;',
      });
      const parser = new OpenScadStderrParser((error) => {
        errors.push(error);
      }, getFileContents);

      parser.parseLine('ERROR: Parser error: syntax error in file /bad.scad, line 2');
      parser.parseLine("Can't parse file 'main.scad'!");

      expect(errors).toEqual([
        {
          message: 'syntax error',
          code: 'RUNTIME',
          type: 'compilation',
          severity: 'error',
          location: {
            fileName: 'bad.scad',
            startLineNumber: 2,
            startColumn: 1,
            endLineNumber: 2,
            endColumn: 1000,
          },
          stackFrames: [
            // Deepest first: middle.scad includes bad.scad
            {
              functionName: 'include',
              fileName: 'middle.scad',
              lineNumber: 1,
              context: 'user',
            },
            // Shallowest: main.scad includes middle.scad
            {
              functionName: 'include',
              fileName: 'main.scad',
              lineNumber: 1,
              context: 'user',
            },
          ],
        },
      ]);
    });

    it("should not create stack frame from 'Can't parse file' without preceding error", () => {
      const errors: KernelIssue[] = [];
      const parser = new OpenScadStderrParser((error) => {
        errors.push(error);
      });

      // Orphaned "Can't parse file" without a preceding error
      parser.parseLine("Can't parse file 'main.scad'!");

      expect(errors).toEqual([]);
    });
  });

  describe('Non-matching messages', () => {
    it('should not call addError for ECHO statements', () => {
      const errors: KernelIssue[] = [];
      parseStderrLine({
        message: 'ECHO: "Hello World"',
        addError(error) {
          errors.push(error);
        },
      });

      expect(errors).toHaveLength(0);
    });

    it('should not call addError for "Can\'t parse file" messages', () => {
      const errors: KernelIssue[] = [];
      parseStderrLine({
        message: "Can't parse file 'main.scad'!",
        addError(error) {
          errors.push(error);
        },
      });

      expect(errors).toHaveLength(0);
    });

    it('should not call addError for empty strings', () => {
      const errors: KernelIssue[] = [];
      parseStderrLine({
        message: '',
        addError(error) {
          errors.push(error);
        },
      });

      expect(errors).toHaveLength(0);
    });

    it('should not call addError for generic info messages', () => {
      const errors: KernelIssue[] = [];
      parseStderrLine({
        message: 'Compiling design (CSG Tree generation)...',
        addError(error) {
          errors.push(error);
        },
      });
      parseStderrLine({
        message: 'Rendering Polygon Mesh using CGAL...',
        addError(error) {
          errors.push(error);
        },
      });

      expect(errors).toHaveLength(0);
    });
  });
});
