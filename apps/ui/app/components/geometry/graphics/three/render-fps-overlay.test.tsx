import { act, render, screen } from '@testing-library/react';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RenderFpsOverlay } from '#components/geometry/graphics/three/render-fps-overlay.js';
import { renderLoopObservers } from '#components/geometry/graphics/three/render-loop-observer.js';
import { resolveSectionPlanePickerRect } from '#components/geometry/graphics/three/controls/section-plane-picker.js';

const mocks = vi.hoisted(() => ({
  frame: undefined as (() => void) | undefined,
  gl: { domElement: undefined as HTMLCanvasElement | undefined },
  invalidate: vi.fn(),
}));
vi.mock('@react-three/fiber', () => ({
  useThree: (select: (state: typeof mocks) => unknown) => select(mocks),
  useFrame: (callback: () => void) => {
    mocks.frame = callback;
  },
}));

const CompiledRenderFpsOverlay = await (async () => {
  const { transformSync } = await import('oxc-transform-react');
  const source = await readFile(new URL('render-fps-overlay.tsx', pathToFileURL(import.meta.filename)), 'utf8');
  const compiled = transformSync('render-fps-overlay.tsx', source, {
    lang: 'tsx',
    reactCompiler: { target: '19' },
  });
  if (compiled.fatal || compiled.errors.length > 0) {
    throw new Error(`React Compiler refused RenderFpsOverlay: ${JSON.stringify(compiled.errors)}`);
  }
  const specifiers = [...compiled.code.matchAll(/^import {[^}]*} from "([^"]+)";$/gm)].map((match) => match[1]!);
  const modules = Object.fromEntries(
    await Promise.all(specifiers.map(async (specifier) => [specifier, await import(specifier)] as const)),
  );
  const linked = compiled.code
    .replaceAll(
      /^import {([^}]*)} from "([^"]+)";$/gm,
      (_match, names: string, specifier: string) =>
        `const { ${names.replaceAll(' as ', ': ')} } = __modules[${JSON.stringify(specifier)}];`,
    )
    .replaceAll(/^export /gm, '');
  // oxlint-disable-next-line no-new-func -- this pin executes the app's compiler output.
  const factory = new Function('__modules', `${linked}\nreturn RenderFpsOverlay;`) as (
    dependencies: Record<string, unknown>,
  ) => typeof RenderFpsOverlay;
  return factory(modules);
})();

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
  mocks.invalidate.mockClear();
});

describe('viewport submission FPS output', () => {
  it('should retain the controls band when compiled code replaces the canvas within the same parent', () => {
    vi.useFakeTimers();
    const parent = document.createElement('div');
    const firstCanvas = document.createElement('canvas');
    parent.append(firstCanvas);
    document.body.append(parent);
    mocks.gl = { domElement: firstCanvas };
    const view = render(<CompiledRenderFpsOverlay hasTopRightGizmo />);
    const firstOutput = screen.getByLabelText('Render-loop submission FPS');
    expect(firstOutput).toHaveClass('top-28');

    const secondCanvas = document.createElement('canvas');
    firstCanvas.replaceWith(secondCanvas);
    mocks.gl = { domElement: secondCanvas };
    view.rerender(<CompiledRenderFpsOverlay hasTopRightGizmo />);
    const secondOutput = screen.getByLabelText('Render-loop submission FPS');
    expect(firstOutput.isConnected).toBe(false);
    expect(secondOutput.parentElement).toBe(parent);
    expect(secondOutput).toHaveClass('top-28');
    expect(secondOutput).not.toHaveClass('top-2');
    expect(renderLoopObservers.has(firstCanvas)).toBe(false);
    expect(renderLoopObservers.has(secondCanvas)).toBe(true);
    expect(mocks.invalidate).not.toHaveBeenCalled();
    view.unmount();
    expect(renderLoopObservers.has(secondCanvas)).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('should move the output and its reserved controls band to a replacement renderer', () => {
    vi.useFakeTimers();
    const firstParent = document.createElement('div');
    const firstCanvas = document.createElement('canvas');
    firstParent.append(firstCanvas);
    const secondParent = document.createElement('div');
    const secondCanvas = document.createElement('canvas');
    secondParent.append(secondCanvas);
    document.body.append(firstParent, secondParent);
    mocks.gl = { domElement: firstCanvas };
    const view = render(<RenderFpsOverlay hasTopRightGizmo />);
    const firstOutput = screen.getByLabelText('Render-loop submission FPS');
    const firstObserver = renderLoopObservers.get(firstCanvas);
    expect(firstOutput).toHaveClass('top-28');

    mocks.gl = { domElement: secondCanvas };
    view.rerender(<RenderFpsOverlay hasTopRightGizmo />);
    const secondOutput = screen.getByLabelText('Render-loop submission FPS');
    expect(firstOutput.isConnected).toBe(false);
    expect(secondOutput.parentElement).toBe(secondParent);
    expect(secondOutput).toHaveClass('top-28');
    expect(secondOutput).not.toHaveClass('top-2');
    expect(renderLoopObservers.has(firstCanvas)).toBe(false);
    expect(renderLoopObservers.get(secondCanvas)).toBeDefined();
    expect(renderLoopObservers.get(secondCanvas)).not.toBe(firstObserver);
    expect(mocks.invalidate).not.toHaveBeenCalled();

    view.unmount();
    expect(renderLoopObservers.has(secondCanvas)).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('should own an accessible non-announcing output without waking demand rendering and remove it on teardown', () => {
    vi.useFakeTimers();
    const parent = document.createElement('div');
    const canvas = document.createElement('canvas');
    parent.append(canvas);
    document.body.append(parent);
    mocks.gl.domElement = canvas;
    const view = render(<RenderFpsOverlay />);
    const output = screen.getByLabelText('Render-loop submission FPS');
    expect(output).toHaveTextContent('FPS · idle');
    expect(output).toHaveAttribute('aria-live', 'off');
    expect(output).toHaveAttribute('aria-description', expect.stringContaining('does not measure GPU completion'));
    act(() => {
      for (let index = 0; index < 40; index++) {
        vi.advanceTimersByTime(8);
        mocks.frame?.();
      }
    });
    expect(output.textContent).toMatch(/128\.0 FPS/u);
    const observer = renderLoopObservers.get(canvas);
    view.rerender(<RenderFpsOverlay hasTopRightGizmo />);
    const cube = { left: 704, top: 10, size: 96 };
    const sectionPicker = resolveSectionPlanePickerRect(cube);
    expect(cube.top + cube.size).toBeLessThan(112);
    expect(sectionPicker.top + sectionPicker.size).toBeLessThan(112);
    expect(screen.getByLabelText('Render-loop submission FPS')).toHaveClass('top-28', 'right-2');
    expect(screen.getByLabelText('Render-loop submission FPS')).not.toHaveClass('top-2');
    expect(renderLoopObservers.get(canvas)).toBe(observer);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByLabelText('Render-loop submission FPS')).toHaveTextContent('FPS · idle');
    expect(mocks.invalidate).not.toHaveBeenCalled();
    expect(renderLoopObservers.has(canvas)).toBe(true);
    view.unmount();
    expect(output.isConnected).toBe(false);
    expect(renderLoopObservers.has(canvas)).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    act(() => {
      mocks.frame?.();
      vi.advanceTimersByTime(1000);
    });
    expect(vi.getTimerCount()).toBe(0);
  });
});
