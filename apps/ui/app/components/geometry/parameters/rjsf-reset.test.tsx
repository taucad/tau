import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RJSFSchema } from '@rjsf/utils';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { Parameters } from '#components/geometry/parameters/parameters.js';
import { ExportSchemaForm } from '#routes/w.$workspace.$project/chat-converter.js';

describe.each(['parameters', 'export'] as const)('%s rendered field reset', (owner) => {
  const renderForm = (schema: RJSFSchema, defaults: Record<string, unknown>, value: Record<string, unknown>) => {
    const onChange = vi.fn<(value: Record<string, unknown>) => void>();
    render(
      <TooltipProvider>
        {owner === 'parameters' ? (
          <Parameters
            jsonSchema={schema}
            defaultParameters={defaults}
            parameters={value}
            onParametersChange={onChange}
            units={{ length: { sourceSymbol: 'mm', displaySymbol: 'mm' } }}
          />
        ) : (
          <ExportSchemaForm
            idPrefix='export-reset-test'
            label='Export'
            shouldShowLabel={false}
            resolved={{ schema, defaults }}
            value={value}
            onChange={onChange}
          />
        )}
      </TooltipProvider>,
    );
    let closedGroup = screen
      .queryAllByRole('button', { name: /^Group:/ })
      .find((button) => button.getAttribute('aria-expanded') === 'false');
    while (closedGroup) {
      fireEvent.click(closedGroup);
      closedGroup = screen
        .queryAllByRole('button', { name: /^Group:/ })
        .find((button) => button.getAttribute('aria-expanded') === 'false');
    }
    onChange.mockClear();
    return onChange;
  };

  it('should reset one tuple coordinate and retain edited siblings', () => {
    const value = { point: [9, 8, 7] };
    const onChange = renderForm(
      {
        type: 'object',
        properties: { point: { type: 'array', items: [{ type: 'number' }, { type: 'number' }, { type: 'number' }] } },
      },
      { point: [1, 2, 3] },
      value,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Reset Point 2' }));

    expect(onChange).toHaveBeenLastCalledWith({ point: [9, 2, 7] });
    expect(value).toEqual({ point: [9, 8, 7] });
  });

  it('should restore the item schema default when no indexed default exists', () => {
    const onChange = renderForm(
      { type: 'object', properties: { items: { type: 'array', items: { type: 'number', default: 1 } } } },
      {},
      { items: [9, 8] },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Reset Items 1' }));

    expect(onChange).toHaveBeenLastCalledWith({ items: [1, 8] });
  });

  it('should restore an object leaf inside a replacement array without losing sibling edits', () => {
    const onChange = renderForm(
      {
        type: 'object',
        properties: {
          rows: {
            type: 'array',
            items: { type: 'object', properties: { depth: { type: 'number' }, enabled: { type: 'boolean' } } },
          },
        },
      },
      { rows: [{ depth: 1, enabled: true }] },
      { rows: [{ depth: 9, enabled: false }] },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Reset Depth' }));

    expect(onChange).toHaveBeenLastCalledWith({ rows: [{ depth: 1, enabled: false }] });
  });

  it('should not offer a reset that would create an undefined tuple slot', () => {
    const onChange = renderForm(
      { type: 'object', properties: { point: { type: 'array', items: [{ type: 'number' }, { type: 'number' }] } } },
      {},
      { point: [9, 8] },
    );

    expect(screen.queryByRole('button', { name: 'Reset Point 1' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reset Point 2' })).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('should preserve array ancestry through selected-branch redispatch', () => {
    const branch = {
      type: 'object',
      required: ['mode', 'depth', 'enabled'],
      properties: { mode: { const: 'first' }, depth: { type: 'number' }, enabled: { type: 'boolean' } },
    } satisfies RJSFSchema;
    const onChange = renderForm(
      {
        type: 'object',
        properties: {
          rows: {
            type: 'array',
            items: { oneOf: [branch, { ...branch, properties: { ...branch.properties, mode: { const: 'second' } } }] },
          },
        },
      },
      { rows: [{ mode: 'first', depth: 1, enabled: true }] },
      { rows: [{ mode: 'first', depth: 9, enabled: false }] },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Reset Depth' }));

    expect(onChange).toHaveBeenLastCalledWith({ rows: [{ mode: 'first', depth: 1, enabled: false }] });
  });

  it('should reset explicit null against a non-null default without changing another field', () => {
    const onChange = renderForm(
      {
        type: 'object',
        properties: { amount: { type: ['number', 'null'], default: 1 }, enabled: { type: 'boolean' } },
      },
      { amount: 1, enabled: false },
      { amount: null, enabled: true },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Reset Amount' }));

    expect(onChange).toHaveBeenLastCalledWith({ enabled: true });
  });

  it('should not mark matching null as modified', () => {
    renderForm(
      { type: 'object', properties: { amount: { type: ['number', 'null'], default: null } } },
      { amount: null },
      { amount: null },
    );

    expect(screen.queryByRole('button', { name: 'Reset Amount' })).toBeNull();
  });

  it('should preserve a changed null sibling when reset produces an all-null tuple', () => {
    const onChange = renderForm(
      {
        type: 'object',
        properties: {
          point: { type: 'array', items: [{ type: ['number', 'null'] }, { type: ['number', 'null'] }] },
        },
      },
      { point: [null, 2] },
      { point: [9, null] },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Reset Point 1' }));

    expect(onChange).toHaveBeenLastCalledWith({ point: [null, null] });
  });

  it('should delete a numeric object-key override rather than treat it as an array slot', () => {
    const onChange = renderForm(
      { type: 'object', properties: { '0': { type: 'number', default: 1 }, sibling: { type: 'number', default: 2 } } },
      { '0': 1, sibling: 2 },
      { '0': 9, sibling: 8 },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Reset 0' }));

    expect(onChange).toHaveBeenLastCalledWith({ sibling: 8 });
  });
});
