import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router';
import { describe, expect, it } from 'vitest';
import { useSearchParameter } from '#hooks/use-search-parameter.js';
import { flagParameter, stringParameter } from '#utils/search-parameter.codecs.js';

const chatParameter = stringParameter();

type ParameterProbe<T> = {
  readonly value: T;
  readonly search: string;
  readonly pathname: string;
  readonly update: (next: T | ((previous: T) => T)) => void;
  readonly goBack: () => void;
};

const renderParameter = <T,>(
  entries: readonly string[],
  useParameter: () => readonly [T, (next: T | ((previous: T) => T)) => void],
) =>
  renderHook(
    (): ParameterProbe<T> => {
      const [value, update] = useParameter();
      const { pathname, search } = useLocation();
      const navigate = useNavigate();
      return {
        value,
        search,
        pathname,
        update,
        goBack: () => {
          void navigate(-1);
        },
      };
    },
    {
      wrapper: ({ children }: { readonly children: React.ReactNode }) => (
        <MemoryRouter initialEntries={[...entries]} initialIndex={entries.length - 1}>
          {children}
        </MemoryRouter>
      ),
    },
  );

const renderTrashFlag = (entries: readonly string[], options?: { readonly history?: 'replace' | 'push' }) =>
  renderParameter(entries, () => useSearchParameter('trash', flagParameter, options));

describe('useSearchParameter', () => {
  it('should read the parameter from the URL', () => {
    const { result } = renderTrashFlag(['/projects?trash=1']);

    expect(result.current.value).toBe(true);
  });

  it('should read the codec fallback when the parameter is absent', () => {
    const { result } = renderTrashFlag(['/projects']);

    expect(result.current.value).toBe(false);
  });

  it('should write the value into the URL', () => {
    const { result } = renderTrashFlag(['/projects']);

    act(() => {
      result.current.update(true);
    });

    expect(result.current.search).toBe('?trash=1');
    expect(result.current.value).toBe(true);
  });

  it('should apply a functional updater to the current value', () => {
    const { result } = renderTrashFlag(['/projects?trash=1']);

    act(() => {
      result.current.update((previous) => !previous);
    });

    expect(result.current.value).toBe(false);
    expect(result.current.search).toBe('');
  });

  it('should remove the parameter when the fallback is written', () => {
    const { result } = renderTrashFlag(['/projects?trash=1']);

    act(() => {
      result.current.update(false);
    });

    expect(result.current.search).toBe('');
  });

  it('should merge into the existing parameters instead of replacing them', () => {
    const { result } = renderParameter(['/w/home/gear?chat=chat_42'], () => useSearchParameter('trash', flagParameter));

    act(() => {
      result.current.update(true);
    });

    expect(new URLSearchParams(result.current.search).get('chat')).toBe('chat_42');
    expect(new URLSearchParams(result.current.search).get('trash')).toBe('1');
  });

  it('should leave other parameters alone when writing a string parameter', () => {
    const { result } = renderParameter(['/w/home/gear?trash=1'], () => useSearchParameter('chat', chatParameter));

    act(() => {
      result.current.update('chat_42');
    });

    expect(new URLSearchParams(result.current.search).get('trash')).toBe('1');
    expect(result.current.value).toBe('chat_42');
  });

  it('should replace the history entry by default', () => {
    const { result } = renderTrashFlag(['/seed', '/projects']);

    act(() => {
      result.current.update(true);
    });
    act(() => {
      result.current.goBack();
    });

    expect(result.current.pathname).toBe('/seed');
  });

  it('should push a history entry when push is opted into', () => {
    const { result } = renderTrashFlag(['/seed', '/projects'], { history: 'push' });

    act(() => {
      result.current.update(true);
    });
    act(() => {
      result.current.goBack();
    });

    expect(result.current.pathname).toBe('/projects');
    expect(result.current.search).toBe('');
  });
});
