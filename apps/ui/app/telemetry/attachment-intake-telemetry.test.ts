import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  attachmentIntakeEventName,
  closedDeclaredType,
  connectAttachmentIntakeTelemetry,
  disconnectAttachmentIntakeTelemetry,
  recordAttachmentIntake,
} from '#telemetry/attachment-intake-telemetry.js';

describe('attachment intake telemetry', () => {
  afterEach(() => {
    disconnectAttachmentIntakeTelemetry();
  });

  it('should capture nothing until analytics connect a capture', () => {
    const capture = vi.fn(() => true);

    recordAttachmentIntake({ outcome: 'stored', format: 'png', declaredType: 'image/png' });
    connectAttachmentIntakeTelemetry(capture);
    disconnectAttachmentIntakeTelemetry();
    recordAttachmentIntake({ outcome: 'stored', format: 'png', declaredType: 'image/png' });

    expect(capture).not.toHaveBeenCalled();
  });

  it('should send the outcome, the probed format and a closed declared type, and nothing else', () => {
    const capture = vi.fn(() => true);
    connectAttachmentIntakeTelemetry(capture);

    recordAttachmentIntake({ outcome: 'converted', format: 'webp', declaredType: 'image/jpeg' });
    recordAttachmentIntake({ outcome: 'refused', reason: 'unsupported-format', format: 'psd', declaredType: '' });
    recordAttachmentIntake({ outcome: 'refused', reason: 'not-an-image', declaredType: 'application/x-secret-name' });

    /* eslint-disable @typescript-eslint/naming-convention -- the expected properties are analytics wire names. */
    expect(capture.mock.calls).toEqual([
      [attachmentIntakeEventName, { outcome: 'converted', probed_format: 'webp', declared_type: 'image/jpeg' }],
      [
        attachmentIntakeEventName,
        { outcome: 'refused', reason: 'unsupported-format', probed_format: 'psd', declared_type: 'none' },
      ],
      [
        attachmentIntakeEventName,
        { outcome: 'refused', reason: 'not-an-image', probed_format: 'unknown', declared_type: 'other' },
      ],
    ]);
    /* eslint-enable @typescript-eslint/naming-convention -- restore application naming rules. */
  });

  it('should never let a failing capture break intake', () => {
    connectAttachmentIntakeTelemetry(() => {
      throw new Error('analytics down');
    });

    expect(() => {
      recordAttachmentIntake({ outcome: 'stored', format: 'jpeg' });
    }).not.toThrow();
  });

  it.each([
    ['image/JPEG', 'image/jpeg'],
    ['image/heif', 'image/heif'],
    ['image/x-icon', 'other'],
    [undefined, 'none'],
  ])('should reduce the declared type %j to %j', (declared, closed) => {
    expect(closedDeclaredType(declared)).toBe(closed);
  });
});
