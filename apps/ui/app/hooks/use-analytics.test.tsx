// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useAnalytics } from '#hooks/use-analytics.js';

describe('useAnalytics', () => {
  it('should give hosts without the web analytics boundary a silent no-op', () => {
    const { result } = renderHook(() => useAnalytics());

    expect(() => {
      result.current.capture('example');
      result.current.captureException(new Error('example'));
    }).not.toThrow();
  });
});
