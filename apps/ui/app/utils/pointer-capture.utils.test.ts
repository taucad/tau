import { describe, it, expect, vi } from 'vitest';
import { capturePointer, releasePointer } from '#utils/pointer-capture.utils.js';

const notFound = (): DOMException => new DOMException('The object can not be found here.', 'NotFoundError');

const createElement = (): HTMLDivElement => {
  const element = document.createElement('div');
  element.setPointerCapture = vi.fn();
  element.releasePointerCapture = vi.fn();
  element.hasPointerCapture = vi.fn(() => true);
  return element;
};

describe('pointer capture', () => {
  describe('capturePointer', () => {
    it('should capture the pointer on the element', () => {
      const element = createElement();

      capturePointer(element, 7);

      expect(element.setPointerCapture).toHaveBeenCalledWith(7);
    });

    it('should not throw when the browser no longer tracks the pointer', () => {
      const element = createElement();
      element.setPointerCapture = vi.fn(() => {
        throw notFound();
      });

      expect(() => {
        capturePointer(element, 7);
      }).not.toThrow();
    });
  });

  describe('releasePointer', () => {
    it('should release a pointer the element holds', () => {
      const element = createElement();

      releasePointer(element, 3);

      expect(element.releasePointerCapture).toHaveBeenCalledWith(3);
    });

    it('should skip a pointer the element does not hold', () => {
      const element = createElement();
      element.hasPointerCapture = vi.fn(() => false);

      releasePointer(element, 3);

      expect(element.releasePointerCapture).not.toHaveBeenCalled();
    });

    it('should not throw when the browser no longer tracks the pointer', () => {
      const element = createElement();
      element.releasePointerCapture = vi.fn(() => {
        throw notFound();
      });

      expect(() => {
        releasePointer(element, 3);
      }).not.toThrow();
    });
  });
});
