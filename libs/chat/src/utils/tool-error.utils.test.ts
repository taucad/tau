import { describe, it, expect } from 'vitest';
import { rpcClientErrorCode } from '#schemas/rpc.schema.js';
import { isRpcExecutionError } from '#types/rpc.types.js';
import {
  assertRpcSuccess,
  isToolExecutionError,
  parseToolErrorEnvelope,
  parseToolErrorText,
  ToolError,
} from '#utils/tool-error.utils.js';

describe('tool error schemas', () => {
  it('parses the shared tool-result error envelope', () => {
    expect(parseToolErrorEnvelope('{"errorCode":"USER_INTERRUPTED","message":"Stopped"}')).toEqual({
      errorCode: 'USER_INTERRUPTED',
      message: 'Stopped',
    });
    expect(parseToolErrorEnvelope('{"errorCode":42}')).toBeUndefined();
    expect(parseToolErrorEnvelope('opaque')).toBeUndefined();
  });

  it('validates tool execution codes from the canonical code array', () => {
    expect(
      isToolExecutionError({
        errorCode: 'STREAM_ERROR',
        message: 'Interrupted',
        toolName: 'read_file',
        toolCallId: 'call-1',
      }),
    ).toBe(true);
    expect(isToolExecutionError({ errorCode: 'NOT_A_TOOL_ERROR' })).toBe(false);
  });

  it.each(['TOOL_INPUT_VALIDATION_FAILED', 'TOOL_OUTPUT_VALIDATION_FAILED'])(
    'should reject incomplete or malformed %s records without repairing them',
    (errorCode) => {
      const base = { errorCode, message: 'Invalid input', toolName: 'export_model', toolCallId: 'call-1' };
      for (const value of [
        { errorCode, message: '✖ Unrecognized key: "toolCallId"' },
        base,
        { ...base, validationErrors: null },
        { ...base, validationErrors: 'bad' },
        { ...base, validationErrors: [{}] },
        { ...base, validationErrors: [{ path: [], message: 'Required' }] },
        { ...base, validationErrors: [], message: {} },
        { ...base, validationErrors: [], toolName: undefined },
        { ...base, validationErrors: [], toolCallId: undefined },
      ]) {
        expect(isToolExecutionError(value)).toBe(false);
        expect(parseToolErrorText(JSON.stringify(value))).toBeUndefined();
      }
      const valid = { ...base, validationErrors: [{ path: 'format', message: 'Required' }] };
      expect(parseToolErrorText(JSON.stringify(valid))).toEqual(valid);
      expect(isToolExecutionError({ ...valid, validationErrors: [] })).toBe(true);
      expect(parseToolErrorText(JSON.stringify({ ...valid, rawOutput: { unexpected: true } }))).toEqual({
        ...valid,
        rawOutput: { unexpected: true },
      });
    },
  );

  it('validates RPC execution codes from the canonical code array', () => {
    expect(isRpcExecutionError({ errorCode: 'TIMEOUT' })).toBe(true);
    expect(isRpcExecutionError({ errorCode: 'NOT_AN_RPC_ERROR' })).toBe(false);
  });
});

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
