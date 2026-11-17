import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import type { Panel, EditorView } from '@codemirror/view';
import { runScopeHandlers } from '@codemirror/view';
import {
  SearchQuery,
  getSearchQuery,
  setSearchQuery,
  findNext,
  findPrevious,
  replaceNext,
  replaceAll,
  selectMatches,
  closeSearchPanel,
} from '@codemirror/search';
import { Button } from '@taucad/ui/components/button';
import { Input } from '@taucad/ui/components/input';

function SearchControls({ view }: { readonly view: EditorView }): React.JSX.Element {
  const query = getSearchQuery(view.state);
  const [isReplacing, setIsReplacing] = useState(false);
  const change = (patch: Partial<SearchQuery>): void => {
    view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ ...query, ...patch })) });
  };
  let count = 0;
  let current = 0;
  if (query.valid) {
    const cursor = query.getCursor(view.state);
    for (let match = cursor.next(); !match.done && count < 1000; match = cursor.next()) {
      count += 1;
      if (match.value.from === view.state.selection.main.from && match.value.to === view.state.selection.main.to) {
        current = count;
      }
    }
  }
  const hasMatches = query.valid && count > 0;
  let status = 'Find in file';
  if (query.search) {
    if (query.valid) {
      status = count === 0 ? 'No matches' : `${current || '–'} of ${count}${count === 1000 ? '+' : ''}`;
    } else {
      status = 'Invalid expression';
    }
  }
  return (
    <div
      className='flex flex-col gap-2 p-2'
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          closeSearchPanel(view);
          view.focus();
        } else if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
          event.preventDefault();
          if (event.target.name === 'replace') {
            replaceNext(view);
          } else {
            (event.shiftKey ? findPrevious : findNext)(view);
          }
        } else if (runScopeHandlers(view, event.nativeEvent, 'search-panel')) {
          event.preventDefault();
        }
      }}
    >
      <div className='flex flex-wrap items-center gap-1'>
        <Button
          variant='ghost'
          size='icon-sm'
          aria-label={isReplacing ? 'Hide replace' : 'Show replace'}
          aria-expanded={isReplacing}
          disabled={view.state.readOnly}
          onClick={() => {
            setIsReplacing(!isReplacing);
          }}
        >
          <span
            aria-hidden='true'
            className={`codicon ${isReplacing ? 'codicon-chevron-down' : 'codicon-chevron-right'}`}
          />
        </Button>
        <div className='min-w-32 flex-1'>
          <Input
            className='border-muted-foreground bg-background text-base md:text-sm dark:bg-background'
            ref={(element) => {
              element?.setAttribute('main-field', 'true');
            }}
            name='search'
            aria-label='Find'
            placeholder='Find in file'
            value={query.search}
            aria-invalid={Boolean(query.search && !query.valid)}
            autoComplete='off'
            onChange={(event) => {
              change({ search: event.target.value });
            }}
          />
        </div>
        <Button
          variant='ghost'
          size='icon-sm'
          aria-label='Close search'
          title='Close search (Escape)'
          onClick={() => {
            closeSearchPanel(view);
            view.focus();
          }}
        >
          <span aria-hidden='true' className='codicon codicon-close' />
        </Button>
      </div>
      {isReplacing && !view.state.readOnly ? (
        <div className='flex flex-wrap items-center gap-2 pr-8 pl-8'>
          <Input
            className='min-w-32 flex-1 border-muted-foreground bg-background text-base md:text-sm dark:bg-background'
            name='replace'
            aria-label='Replace'
            placeholder='Replace with'
            value={query.replace}
            onChange={(event) => {
              change({ replace: event.target.value });
            }}
          />
          <Button
            variant='outline'
            size='sm'
            disabled={!hasMatches}
            onClick={() => {
              replaceNext(view);
            }}
          >
            Replace
          </Button>
          <Button
            variant='outline'
            size='sm'
            disabled={!hasMatches}
            onClick={() => {
              replaceAll(view);
            }}
          >
            Replace all
          </Button>
        </div>
      ) : null}
      <div className='flex flex-wrap items-center gap-1'>
        {(
          [
            ['caseSensitive', 'Match case', 'Aa'],
            ['wholeWord', 'Whole word', 'ab'],
            ['regexp', 'Regular expression', '.*'],
          ] as const
        ).map(([key, label, glyph]) => (
          <Button
            key={key}
            variant={query[key] ? 'secondary' : 'ghost'}
            size='icon-sm'
            aria-label={label}
            title={label}
            aria-pressed={query[key]}
            onClick={() => {
              change({ [key]: !query[key] });
            }}
          >
            <span className='font-mono text-xs'>{glyph}</span>
          </Button>
        ))}
        <span
          role='status'
          aria-live='polite'
          className='min-w-20 flex-1 px-2 text-xs text-muted-foreground tabular-nums'
        >
          {status}
        </span>
        <Button
          variant='ghost'
          size='icon-sm'
          aria-label='Previous match'
          title='Previous match (Shift+Enter)'
          disabled={!hasMatches}
          onClick={() => {
            findPrevious(view);
          }}
        >
          <span aria-hidden='true' className='codicon codicon-arrow-up' />
        </Button>
        <Button
          variant='ghost'
          size='icon-sm'
          aria-label='Next match'
          title='Next match (Enter)'
          disabled={!hasMatches}
          onClick={() => {
            findNext(view);
          }}
        >
          <span aria-hidden='true' className='codicon codicon-arrow-down' />
        </Button>
        <Button
          variant='ghost'
          size='xs'
          disabled={!hasMatches}
          onClick={() => {
            selectMatches(view);
          }}
        >
          Select all
        </Button>
      </div>
    </div>
  );
}

/** Mount the shared Tau controls into CodeMirror's search-panel lifecycle. */
export function createEditorSearchPanel(view: EditorView): Panel {
  const dom = document.createElement('div');
  dom.className = 'cm-tau-search';
  dom.setAttribute('role', 'search');
  dom.setAttribute('aria-label', 'Find and replace');
  const root = createRoot(dom);
  const render = (): void => {
    root.render(<SearchControls view={view} />);
  };
  return {
    dom,
    top: true,
    mount: () => {
      render();
      requestAnimationFrame(() => {
        dom.querySelector<HTMLInputElement>('input[name=search]')?.focus();
      });
    },
    update: (update) => {
      if (
        update.docChanged ||
        update.selectionSet ||
        !getSearchQuery(update.startState).eq(getSearchQuery(update.state)) ||
        update.startState.readOnly !== update.state.readOnly
      ) {
        render();
      }
    },
    destroy: () => {
      queueMicrotask(() => {
        root.unmount();
      });
    },
  };
}
