import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FileParameterEntry, JSONValue } from '@taucad/types';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import type { ParameterCommit } from '@taucad/viewer/parameters/rjsf-context';
import { ExportSchemaForm } from '#export/export-pane.jsx';
import { compileExportConfigurationManifest } from '#export/export-source.js';
import type { ExportOptionBinding, ExportOptionStore, ExportSchema } from '#export/export-source.js';

const resolved: ExportSchema = {
  schema: {
    type: 'object',
    properties: { binary: { type: 'boolean', default: true } },
  },
  defaults: { binary: true },
};

/** An in-memory authoritative record that notifies its readers like the app's parameter actor. */
const createStore = async (initial: Record<string, unknown> = {}) => {
  const { manifest } = await compileExportConfigurationManifest('replicad', 'export/stl/options', resolved);
  const listeners = new Set<() => void>();
  let entry: FileParameterEntry = {
    activeGroup: 'default',
    groups: { default: { values: initial as unknown as Record<string, JSONValue> } },
  };
  const replaceValues = vi.fn(async (values: Record<string, unknown>) => {
    entry = {
      activeGroup: 'default',
      groups: { default: { values: values as unknown as Record<string, JSONValue> } },
    };
    for (const listener of listeners) {
      listener();
    }
  });
  const binding: ExportOptionBinding = {
    manifest,
    commit: {
      target: { authority: 'test', root: '/', entry: 'x' },
    } as unknown as ParameterCommit,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getEntry: () => entry,
    replaceValues,
  };
  const open = vi.fn(async () => binding);
  const store: ExportOptionStore = { open };
  return { store, open, replaceValues };
};

const renderForm = (props: Partial<Parameters<typeof ExportSchemaForm>[0]> = {}) => {
  const onChange = vi.fn();
  render(
    <TooltipProvider>
      <ExportSchemaForm
        idPrefix='stl'
        provider='replicad'
        configuration='export/stl/options'
        label='STL options'
        shouldShowLabel={false}
        resolved={resolved}
        value={{}}
        onChange={onChange}
        {...props}
      />
    </TooltipProvider>,
  );
  return onChange;
};

describe('ExportSchemaForm', () => {
  it('should edit values in place when no store keeps them', async () => {
    const onChange = renderForm();
    const binary = await screen.findByRole('switch', { name: /binary/i });
    await act(async () => {
      fireEvent.click(binary);
    });
    expect(onChange).toHaveBeenLastCalledWith({ binary: false });
  });

  it('should open the record with the kept values and mirror what it holds', async () => {
    const { store, open, replaceValues } = await createStore({ binary: false });
    const onChange = renderForm({
      optionStore: store,
      value: { binary: false },
    });

    await screen.findByRole('switch', { name: /binary/i });
    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'replicad',
        configuration: 'export/stl/options',
        legacyValues: { binary: false },
      }),
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: /binary/i }));
    });
    await waitFor(() => {
      expect(replaceValues).toHaveBeenCalledWith({});
      expect(onChange).toHaveBeenLastCalledWith({});
    });
  });

  it('should report a store that cannot open the record', async () => {
    const onError = vi.fn();
    const store: ExportOptionStore = {
      open: vi.fn(async () => {
        throw new Error('disk unavailable');
      }),
    };
    renderForm({ optionStore: store, onError });

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith('STL options could not be prepared: disk unavailable');
    });
  });

  it('should show the failure in place without a reporter', async () => {
    const store: ExportOptionStore = {
      open: vi.fn(async () => {
        throw new Error('disk unavailable');
      }),
    };
    renderForm({ optionStore: store });

    expect(await screen.findByRole('alert')).toMatchTextContent('STL options could not be prepared: disk unavailable');
  });
});
