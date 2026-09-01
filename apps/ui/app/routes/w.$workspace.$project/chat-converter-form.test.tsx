import { imageEdgeSchemas } from '@taucad/image';
import type { JSONSchema7 } from '@taucad/json-schema';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { toJSONSchema } from 'zod';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { ExportSchemaForm } from '#routes/w.$workspace.$project/chat-converter.js';

const schema = toJSONSchema(imageEdgeSchemas.png, { target: 'draft-7', io: 'input' }) as JSONSchema7;
const defaults = imageEdgeSchemas.png.parse({}) as Record<string, unknown>;
const pngResolved: Parameters<typeof ExportSchemaForm>[0]['resolved'] = { schema, defaults };
const includeEdgesResolved: Parameters<typeof ExportSchemaForm>[0]['resolved'] = {
  schema: {
    type: 'object',
    properties: { includeEdges: { type: 'boolean', default: false } },
  },
  defaults: { includeEdges: false },
};

const renderPngForm = (
  value: Record<string, unknown> = {},
  resolved: Parameters<typeof ExportSchemaForm>[0]['resolved'] = pngResolved,
) => {
  const onChange = vi.fn();
  const Harness = () => {
    const [currentValue, setCurrentValue] = useState(value);
    return (
      <ExportSchemaForm
        idPrefix='///png'
        label='PNG options'
        shouldShowLabel={false}
        resolved={resolved}
        value={currentValue}
        onChange={(nextValue) => {
          onChange(nextValue);
          setCurrentValue(nextValue);
        }}
      />
    );
  };
  render(
    <TooltipProvider>
      <Harness />
    </TooltipProvider>,
  );
  return onChange;
};

describe('ExportSchemaForm', () => {
  it('should mount runtime-valid PNG defaults without errors or synthetic persistence', () => {
    const onChange = renderPngForm();

    expect(screen.queryByText(/must be number/i)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reset Include Edges' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reset Framing' })).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('should switch the real PNG camera branch and return to a clean valid default', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    Element.prototype.hasPointerCapture = vi.fn(() => false);
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
    const user = userEvent.setup();
    const onChange = renderPngForm();
    await user.click(screen.getByRole('button', { name: 'Group: Camera' }));
    const framing = screen.getByRole('combobox', { name: 'Select for Framing' });

    await user.click(framing);
    await user.click(screen.getByRole('option', { name: 'Fixed' }));
    await waitFor(() => {
      const emitted = onChange.mock.lastCall?.[0] as Record<string, unknown>;
      expect(emitted).toMatchObject({ camera: { framing: 'fixed' } });
      expect(imageEdgeSchemas.png.safeParse(emitted).success).toBe(true);
      expect(screen.queryByText(/must be|is a required property/i)).toBeNull();
    });

    await user.click(screen.getByRole('combobox', { name: 'Select for Framing' }));
    await user.click(screen.getByRole('option', { name: 'Fit' }));
    await waitFor(() => {
      expect(onChange.mock.lastCall?.[0]).toEqual({});
      expect(screen.queryByRole('button', { name: 'Reset Framing' })).toBeNull();
    });
  });

  it('should mark Include Edges only while it differs from its authoritative default', async () => {
    const onChange = renderPngForm({}, includeEdgesResolved);
    const includeEdges = screen.getByRole('switch', { name: 'Toggle for Include Edges' });
    expect(includeEdges).not.toBeChecked();

    fireEvent.click(includeEdges);
    await waitFor(() => {
      expect(onChange.mock.lastCall?.[0]).toEqual({ includeEdges: true });
      expect(screen.getByRole('button', { name: 'Reset Include Edges' })).toBeInTheDocument();
    });

    fireEvent.click(includeEdges);
    await waitFor(() => {
      expect(onChange.mock.lastCall?.[0]).toEqual({});
      expect(screen.queryByRole('button', { name: 'Reset Include Edges' })).toBeNull();
    });
  });

  it.each([
    [
      'batch',
      () => {
        const value = imageEdgeSchemas.png.parse({ mode: 'batch' });
        if (value.mode !== 'batch') {
          throw new TypeError('Expected batch image options');
        }
        return { mode: value.mode, views: value.views };
      },
    ],
    [
      'fixed camera',
      () => {
        const value = imageEdgeSchemas.png.parse({ camera: { framing: 'fixed' } });
        if (value.mode !== 'single') {
          throw new TypeError('Expected single image options');
        }
        return { camera: value.camera };
      },
    ],
    [
      'first section plane',
      () => {
        const value = imageEdgeSchemas.png.parse({ sections: { planes: [{}] } });
        return { sections: value.sections };
      },
    ],
  ] as const)('should mount a valid system-created %s state', (_label, createValue) => {
    const onChange = renderPngForm(createValue());

    expect(screen.queryByText(/must be|is a required property/i)).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('should clear an optional string without persisting the word undefined', () => {
    const onChange = renderPngForm({ label: 'front' });

    fireEvent.change(screen.getByRole('textbox', { name: 'Input for Label' }), { target: { value: '' } });
    const emitted = onChange.mock.lastCall?.[0] as Record<string, unknown> | undefined;
    expect(emitted).toBeDefined();
    expect(emitted).not.toHaveProperty('label');
    expect(screen.queryByText(/must be|is a required property/i)).toBeNull();
  });

  it('should add a runtime-valid batch view', async () => {
    const batch = imageEdgeSchemas.png.parse({ mode: 'batch' });
    if (batch.mode !== 'batch') {
      throw new TypeError('Expected batch image options');
    }
    const onChange = renderPngForm({ mode: batch.mode, views: batch.views });

    fireEvent.click(screen.getByRole('button', { name: /Views/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Add item (Views)' }));

    await waitFor(() => {
      const emitted = onChange.mock.lastCall?.[0] as Record<string, unknown> | undefined;
      expect(emitted).toBeDefined();
      expect(imageEdgeSchemas.png.safeParse(emitted).success).toBe(true);
      expect(emitted?.['views']).toHaveLength(2);
    });
  });

  it('should add and remove a runtime-valid visible primitive without initial errors', async () => {
    const onChange = renderPngForm();

    fireEvent.click(screen.getByRole('button', { name: 'Group: Visible Primitives' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add item (Visible Primitives)' }));

    await waitFor(() => {
      const emitted = onChange.mock.lastCall?.[0] as Record<string, unknown> | undefined;
      expect(emitted).toMatchObject({ visiblePrimitives: [{ nodeIndex: 0, meshIndex: 0, primitiveIndex: 0 }] });
      expect(imageEdgeSchemas.png.safeParse(emitted).success).toBe(true);
      expect(screen.queryByText(/is a required property|must have required property/i)).toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Remove Visible Primitives 1' }));
    await waitFor(() => {
      expect(onChange.mock.lastCall?.[0]).toEqual({});
    });
  });
});
