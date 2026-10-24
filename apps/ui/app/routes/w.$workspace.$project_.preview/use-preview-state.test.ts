import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { usePreviewState } from '#routes/w.$workspace.$project_.preview/use-preview-state.js';

describe('usePreviewState mobile drawer', () => {
  it('opens on the model with the drawer collapsed', () => {
    const { result } = renderHook(() => usePreviewState());

    expect(result.current.activeTab).toBe('model');
    expect(result.current.drawerOpen).toBe(false);
  });

  it('keeps the drawer open exactly while a panel other than the model is active', () => {
    const { result } = renderHook(() => usePreviewState());

    act(() => {
      result.current.handleTabChange('parameters');
    });
    expect(result.current.drawerOpen).toBe(true);

    act(() => {
      result.current.handleDrawerChange(false);
    });
    expect(result.current.activeTab).toBe('model');
    expect(result.current.drawerOpen).toBe(false);
  });

  it('reopens the drawer at its first snap point after the Model tab collapses it', () => {
    const { result } = renderHook(() => usePreviewState());

    act(() => {
      result.current.handleTabChange('files');
    });
    act(() => {
      result.current.handleSnapChange(result.current.snapPoints.at(-1)!);
    });
    act(() => {
      result.current.handleTabChange('model');
    });
    act(() => {
      result.current.handleTabChange('details');
    });

    expect(result.current.drawerOpen).toBe(true);
    expect(result.current.activeSnapPoint).toBe(result.current.snapPoints[0]);
  });
});
