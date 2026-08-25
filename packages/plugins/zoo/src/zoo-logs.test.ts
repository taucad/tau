import { describe, it, expect, vi, afterEach } from 'vitest';
import { createZooLogger, isDebugEnabled } from '#zoo-logs.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createZooLogger', () => {
  it('should return an object with all expected log methods', () => {
    const logger = createZooLogger('TestComponent');

    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.trace).toBe('function');
    expect(typeof logger.req).toBe('function');
    expect(typeof logger.res).toBe('function');
  });

  it('should export isDebugEnabled as false', () => {
    expect(isDebugEnabled).toBe(false);
  });

  it('should not call console.log when info is called (debug disabled)', () => {
    const spy = vi.spyOn(console, 'log').mockReturnValue();
    const logger = createZooLogger('Test');

    logger.info('test message');

    expect(spy).not.toHaveBeenCalled();
  });

  it('should not call console.error when error is called (debug disabled)', () => {
    const spy = vi.spyOn(console, 'error').mockReturnValue();
    const logger = createZooLogger('Test');

    logger.error('test error');

    expect(spy).not.toHaveBeenCalled();
  });

  it('should not call console.warn when warn is called (debug disabled)', () => {
    const spy = vi.spyOn(console, 'warn').mockReturnValue();
    const logger = createZooLogger('Test');

    logger.warn('test warning');

    expect(spy).not.toHaveBeenCalled();
  });

  it('should not call console.log when debug is called (debug disabled)', () => {
    const spy = vi.spyOn(console, 'log').mockReturnValue();
    const logger = createZooLogger('Test');

    logger.debug('debug message');

    expect(spy).not.toHaveBeenCalled();
  });

  it('should not call console.log when trace is called (debug disabled)', () => {
    const spy = vi.spyOn(console, 'log').mockReturnValue();
    const logger = createZooLogger('Test');

    logger.trace('trace message');

    expect(spy).not.toHaveBeenCalled();
  });

  it('should not call console.log when req is called (debug disabled)', () => {
    const spy = vi.spyOn(console, 'log').mockReturnValue();
    const logger = createZooLogger('Test');

    logger.req('request message');

    expect(spy).not.toHaveBeenCalled();
  });

  it('should not call console.log when res is called (debug disabled)', () => {
    const spy = vi.spyOn(console, 'log').mockReturnValue();
    const logger = createZooLogger('Test');

    logger.res('response message');

    expect(spy).not.toHaveBeenCalled();
  });
});
