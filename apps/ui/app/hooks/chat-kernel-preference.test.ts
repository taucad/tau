import { describe, expect, it } from 'vitest';
import { chatKernelPreference } from '#hooks/chat-kernel-preference.js';

describe('chatKernelPreference (the legacy-row rule, blueprint D2)', () => {
  it('should keep a stored preference, Auto included', () => {
    expect(chatKernelPreference({ stored: 'auto', legacyKernel: 'openscad', ownerKernel: 'replicad' })).toBe('auto');
    expect(chatKernelPreference({ stored: 'jscad', legacyKernel: undefined, ownerKernel: undefined })).toBe('jscad');
  });

  it("should read a row without one as Auto when its kernel is the owner's or there is no owner", () => {
    expect(chatKernelPreference({ stored: undefined, legacyKernel: 'replicad', ownerKernel: 'replicad' })).toBe('auto');
    expect(chatKernelPreference({ stored: undefined, legacyKernel: 'replicad', ownerKernel: undefined })).toBe('auto');
    expect(chatKernelPreference({ stored: undefined, legacyKernel: undefined, ownerKernel: 'replicad' })).toBe('auto');
  });

  it("should keep a legacy kernel that differs from the owner's: a real manual pick", () => {
    expect(chatKernelPreference({ stored: undefined, legacyKernel: 'openscad', ownerKernel: 'replicad' })).toBe(
      'openscad',
    );
  });

  it('should heal an unknown stored value through the same rule', () => {
    expect(chatKernelPreference({ stored: 'Auto', legacyKernel: 'openscad', ownerKernel: 'replicad' })).toBe(
      'openscad',
    );
    expect(chatKernelPreference({ stored: 'retired', legacyKernel: 'retired', ownerKernel: 'replicad' })).toBe('auto');
  });
});
