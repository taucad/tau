import { describe, it, expect } from 'vitest';
import { rpcClientErrorCode } from '#schemas/rpc.schema.js';
import { assertRpcSuccess, ToolError } from '#utils/tool-error.utils.js';

describe('assertRpcSuccess', () => {
  const baseOptions = { toolName: 'grep', toolCallId: 'call-1' };

  it('omits clientErrorMessage → wire diagnostic only', () => {
    const result = {
      success: false,
      errorCode: rpcClientErrorCode.fileNotFound,
      message: 'Path does not exist: foo.scad',
    } as const;
    expect(() => {
      assertRpcSuccess(result, baseOptions);
    }).toThrow(ToolError);
    try {
      assertRpcSuccess(result, baseOptions);
    } catch (error) {
      expect(error).toBeInstanceOf(ToolError);
      expect((error as ToolError).data.message).toBe('FILE_NOT_FOUND: Path does not exist: foo.scad');
    }
  });

  it('static clientErrorMessage → label then wire diagnostic in parentheses', () => {
    const result = {
      success: false,
      errorCode: rpcClientErrorCode.fileNotFound,
      message: 'Path does not exist: foo.scad',
    } as const;
    expect(() => {
      assertRpcSuccess(result, { ...baseOptions, clientErrorMessage: 'Grep search failed' });
    }).toThrow(ToolError);
    try {
      assertRpcSuccess(result, { ...baseOptions, clientErrorMessage: 'Grep search failed' });
    } catch (error) {
      expect(error).toBeInstanceOf(ToolError);
      expect((error as ToolError).data.message).toBe(
        'Grep search failed (FILE_NOT_FOUND: Path does not exist: foo.scad)',
      );
    }
  });

  it('function clientErrorMessage → verbatim return', () => {
    const result = {
      success: false,
      errorCode: rpcClientErrorCode.fileNotFound,
      message: 'Path does not exist: foo.scad',
    } as const;
    expect(() => {
      assertRpcSuccess(result, {
        ...baseOptions,
        clientErrorMessage: () => 'custom only',
      });
    }).toThrow(ToolError);
    try {
      assertRpcSuccess(result, {
        ...baseOptions,
        clientErrorMessage: () => 'custom only',
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ToolError);
      expect((error as ToolError).data.message).toBe('custom only');
    }
  });
});
