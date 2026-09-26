import { assimpEdgeSchemas } from '@taucad/assimp';
import { imageEdgeSchemas } from '@taucad/image';
import { openrscadExportSchemas } from '@taucad/openrscad';
import type { JSONSchema7 } from '@taucad/json-schema';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { toJSONSchema } from 'zod';
import type { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { toast } from '#components/ui/sonner.js';
import { ExportSchemaForm } from '#routes/w.$workspace.$project/chat-converter.js';
import { createConfigurationParameterOwner } from '#routes/w.$workspace.$project/chat-converter.test-utils.js';

vi.mock('#components/ui/sonner.js', () => ({
  toast: { error: vi.fn() },
}));

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

type Resolved = Parameters<typeof ExportSchemaForm>[0]['resolved'];

/** A route schema exactly as the runtime publishes it: Draft-7 input JSON, no dialect, plain own keys. */
const published = (schema: z.ZodType, defaults: Record<string, unknown>): Resolved => {
  const { $schema: _dialect, ...plain } = toJSONSchema(schema, { target: 'draft-7', io: 'input' }) as JSONSchema7;
  return { schema: plain as JSONSchema7, defaults };
};

const fieldUnit = (label: string): string | undefined =>
  screen
    .getByRole('spinbutton', { name: `Input for ${label}` })
    .closest<HTMLElement>('[data-slot="slider-input"]')
    ?.querySelector<HTMLElement>('[data-slot="slider-input-adornment"]')
    ?.textContent.trim();

const renderPngForm = async (
  value: Record<string, unknown> = {},
  resolved: Parameters<typeof ExportSchemaForm>[0]['resolved'] = pngResolved,
  lengthDisplaySymbol?: string,
) => {
  const onChange = vi.fn();
  const parameterOwner = createConfigurationParameterOwner();
  const Harness = () => {
    const [currentValue, setCurrentValue] = useState(value);
    return (
      <ExportSchemaForm
        idPrefix='///png'
        label='PNG options'
        shouldShowLabel={false}
        parameterOwner={parameterOwner}
        resolved={resolved}
        {...(lengthDisplaySymbol === undefined ? {} : { lengthDisplaySymbol })}
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
  await waitFor(() => {
    expect(screen.queryByText('Loading checked settings…')).toBeNull();
  });
  onChange.mockClear();
  return onChange;
};

describe('ExportSchemaForm', async () => {
  it('should mount runtime-valid PNG defaults without errors or synthetic persistence', async () => {
    const onChange = await renderPngForm();

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
    const onChange = await renderPngForm();
    await user.click(screen.getByRole('button', { name: 'Group: Camera' }));
    const framing = screen.getByRole('combobox', { name: 'Select for Framing' });

    await user.click(framing);
    await user.click(screen.getByRole('option', { name: 'Fixed' }));
    await waitFor(() => {
      const emitted = onChange.mock.lastCall?.[0] as Record<string, unknown>;
      expect(emitted).toMatchObject({ camera: { framing: 'fixed' } });
      const parsed = imageEdgeSchemas.png.safeParse(emitted);
      expect(
        parsed.success,
        parsed.success ? undefined : JSON.stringify({ emitted, issues: parsed.error.issues }),
      ).toBe(true);
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
    const onChange = await renderPngForm({}, includeEdgesResolved);
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
  ] as const)('should mount a valid system-created %s state', async (_label, createValue) => {
    const onChange = await renderPngForm(createValue());

    expect(screen.queryByText(/must be|is a required property/i)).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('should clear an optional string without persisting the word undefined', async () => {
    const onChange = await renderPngForm({ label: 'front' });

    fireEvent.change(screen.getByRole('textbox', { name: 'Input for Label' }), { target: { value: '' } });
    await waitFor(() => {
      const emitted = onChange.mock.lastCall?.[0] as Record<string, unknown> | undefined;
      expect(emitted).toBeDefined();
      expect(emitted).not.toHaveProperty('label');
    });
    expect(screen.queryByText(/must be|is a required property/i)).toBeNull();
  });

  it('should add a runtime-valid batch view', async () => {
    const batch = imageEdgeSchemas.png.parse({ mode: 'batch' });
    if (batch.mode !== 'batch') {
      throw new TypeError('Expected batch image options');
    }
    const onChange = await renderPngForm({ mode: batch.mode, views: batch.views });

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
    const onChange = await renderPngForm();

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

  it('should mount a pinned-source assimp STL route the runtime publishes', async () => {
    vi.mocked(toast.error).mockClear();
    await renderPngForm({}, published(assimpEdgeSchemas.stl, assimpEdgeSchemas.stl.parse({})));

    expect(screen.getByRole('switch', { name: 'Toggle for Binary' })).toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('should show the units each owner declares at its source', async () => {
    await renderPngForm();
    expect(fieldUnit('Width')).toBe('px');

    cleanup();
    await renderPngForm({}, published(openrscadExportSchemas.glb, openrscadExportSchemas.glb.parse({})));
    fireEvent.click(screen.getByRole('button', { name: 'Group: Tessellation' }));
    expect(fieldUnit('Minimum Size')).toBe('mm');
    expect(fieldUnit('Minimum Angle')).toBe('°');
    expect(fieldUnit('Segments')).toBeFalsy();
  });

  it('should not guess a pixel unit for an unannotated field that happens to be called width', async () => {
    await renderPngForm(
      {},
      { schema: { type: 'object', properties: { width: { type: 'number', default: 10 } } }, defaults: { width: 10 } },
    );

    expect(fieldUnit('Width')).not.toBe('px');
  });

  it('should present model lengths in the project display unit', async () => {
    await renderPngForm({}, published(openrscadExportSchemas.glb, openrscadExportSchemas.glb.parse({})), 'cm');
    fireEvent.click(screen.getByRole('button', { name: 'Group: Tessellation' }));

    expect(fieldUnit('Minimum Size')).toBe('cm');
    expect(screen.getByRole('spinbutton', { name: 'Input for Minimum Size' })).toHaveValue('0.2');
  });

  it('should name the format whose settings could not be prepared', async () => {
    vi.mocked(toast.error).mockClear();
    // The shape `omitJsonSchemaProperties` once published: an own `required` key holding undefined.
    const notCanonical: JSONSchema7 = { type: 'object' };
    Reflect.set(notCanonical, 'required', undefined);
    render(
      <TooltipProvider>
        <ExportSchemaForm
          idPrefix='///stl'
          label='STL options'
          shouldShowLabel={false}
          parameterOwner={createConfigurationParameterOwner()}
          resolved={{ schema: notCanonical, defaults: {} }}
          value={{}}
          onChange={vi.fn()}
        />
      </TooltipProvider>,
    );

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringMatching(/^STL options could not be prepared: INVALID_SCHEMA at \/: .*\$\.required/u),
      );
    });
  });
});
