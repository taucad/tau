import { describe, it, expect } from 'vitest';
import { formatOcExceptionMessage, OcKernelError } from '#oc-kernel-error.js';

describe('formatOcExceptionMessage', () => {
  it('should return mapped description when typeName matches a known prefix', () => {
    const result = formatOcExceptionMessage('Standard_ConstructionError', 'some detail');
    expect(result).toContain('Construction failed');
    expect(result).toContain('Standard_ConstructionError');
  });

  it('should match rawMessage against known prefixes before typeName', () => {
    const result = formatOcExceptionMessage('UnknownType', 'BRepSweep_Translation failed');
    expect(result).toContain('Sweep/extrusion failed');
    expect(result).toContain('BRepSweep_Translation');
  });

  it('should format as "KernelError: Type: message" when both non-empty and no match', () => {
    const result = formatOcExceptionMessage('CustomType', 'custom message');
    expect(result).toBe('KernelError: CustomType: custom message');
  });

  it('should format with type only when message is empty', () => {
    const result = formatOcExceptionMessage('SomeType', '');
    expect(result).toBe('KernelError: SomeType');
  });

  it('should format with message only when type is empty', () => {
    const result = formatOcExceptionMessage('', 'some message');
    expect(result).toBe('KernelError: some message');
  });

  it('should return generic message when both are empty', () => {
    const result = formatOcExceptionMessage('', '');
    expect(result).toBe('KernelError: Unknown kernel error');
  });

  it('should match the first known prefix when rawMessage matches', () => {
    const result = formatOcExceptionMessage('Standard_Failure', 'BOPAlgo_AlertBOPNotAllowed detail');
    expect(result).toContain('Boolean operation is not allowed');
  });
});

describe('OcKernelError', () => {
  it('should set typeName and rawMessage properties', () => {
    const error = new OcKernelError('Standard_ConstructionError', 'degenerate input');
    expect(error.typeName).toBe('Standard_ConstructionError');
    expect(error.rawMessage).toBe('degenerate input');
  });

  it('should extend Error with formatted message', () => {
    const error = new OcKernelError('Standard_ConstructionError', 'degenerate input');
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain('KernelError');
    expect(error.message).toContain('Construction failed');
    expect(error.name).toBe('OcKernelError');
  });

  it('should produce generic message when both typeName and rawMessage are empty', () => {
    const error = new OcKernelError('', '');
    expect(error.message).toBe('KernelError: Unknown kernel error');
  });
});
