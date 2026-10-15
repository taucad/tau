// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AdditionalField as AdditionalFieldConfig } from '@better-auth-ui/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdditionalField } from '#components/auth/additional-field.js';

afterEach(cleanup);

describe('custom additional field form binding', () => {
  it('submits a changed controlled value and reports blur validation without requiring a named custom input', async () => {
    const validate = vi.fn((value: unknown) => {
      if (value === 'invalid') {
        throw new Error('Choose another value');
      }
    });
    const field: AdditionalFieldConfig = {
      name: 'nickname',
      label: 'Nickname',
      type: 'string',
      defaultValue: 'Initial',
      validate,
      render: ({ value, onChange, onBlur, errors }) => (
        <>
          <input
            aria-label='Nickname'
            value={String(value)}
            onChange={(event) => {
              onChange(event.target.value);
            }}
            onBlur={onBlur}
          />
          <span>{errors?.join(', ')}</span>
        </>
      ),
    };
    const { container } = render(
      <form>
        <AdditionalField name='nickname' field={field} />
      </form>,
    );
    const form = container.querySelector('form');
    if (!form) {
      throw new Error('Expected form');
    }
    expect(new FormData(form).get('nickname')).toBe('Initial');
    fireEvent.change(screen.getByLabelText('Nickname'), { target: { value: 'invalid' } });
    expect(new FormData(form).get('nickname')).toBe('invalid');
    fireEvent.blur(screen.getByLabelText('Nickname'));
    await waitFor(() => {
      expect(screen.getByText('Choose another value')).toBeTruthy();
    });
    expect(validate).toHaveBeenCalledWith('invalid');
  });

  it.each(['stale rejection', 'stale success', 'edited without another blur'] as const)(
    'should ignore %s after the custom field changes',
    async (scenario) => {
      const pending = Promise.withResolvers<void>();
      const validate = vi.fn(async (value: unknown) => {
        if (value === 'old') {
          await pending.promise;
        } else if (scenario === 'stale success') {
          throw new Error('Current value is invalid');
        }
      });
      const field: AdditionalFieldConfig = {
        name: 'nickname',
        label: 'Nickname',
        type: 'string',
        defaultValue: 'old',
        validate,
        render: ({ value, onChange, onBlur, errors, isInvalid }) => (
          <>
            <input
              aria-label='Nickname'
              aria-invalid={isInvalid}
              value={String(value)}
              onChange={(event) => {
                onChange(event.target.value);
              }}
              onBlur={onBlur}
            />
            <span role='status'>{errors?.join(', ')}</span>
          </>
        ),
      };
      render(<AdditionalField name='nickname' field={field} />);
      const input = screen.getByLabelText('Nickname');
      fireEvent.blur(input);
      fireEvent.change(input, { target: { value: 'new' } });
      if (scenario !== 'edited without another blur') {
        fireEvent.blur(input);
        await waitFor(() => {
          expect(validate).toHaveBeenCalledWith('new');
        });
      }
      if (scenario === 'stale success') {
        await screen.findByText('Current value is invalid');
      }
      await act(async () => {
        if (scenario === 'stale success') {
          pending.resolve();
        } else {
          pending.reject(new Error('Old value is invalid'));
        }
        await pending.promise.catch(() => undefined);
      });
      expect(input).toHaveValue('new');
      if (scenario === 'stale success') {
        expect(screen.getByRole('status')).toHaveTextContent('Current value is invalid');
      } else {
        expect(screen.getByRole('status')).toBeEmptyDOMElement();
      }
      expect(input).toHaveAttribute('aria-invalid', scenario === 'stale success' ? 'true' : 'false');
      expect(screen.queryByText('Old value is invalid')).not.toBeInTheDocument();
    },
  );

  it.each([
    ['boolean', false, 'false'],
    ['number', 0, '0'],
    ['date', new Date('2026-10-01T00:00:00Z'), '2026-10-01T00:00:00.000Z'],
    ['date', new Date(''), ''],
    ['string', null, ''],
  ] as const)('preserves %s values and omits read-only fields from FormData', (type, defaultValue, expected) => {
    const field: AdditionalFieldConfig = { name: 'extra', label: 'Extra', type, defaultValue, render: () => null };
    const { container, rerender } = render(
      <form>
        <AdditionalField name='extra' field={field} />
      </form>,
    );
    const form = container.querySelector('form');
    if (!form) {
      throw new Error('Expected form');
    }
    expect(new FormData(form).get('extra')).toBe(expected);
    rerender(
      <form>
        <AdditionalField name='extra' field={{ ...field, readOnly: true }} />
      </form>,
    );
    expect(new FormData(form).has('extra')).toBe(false);
  });
});
