import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AskedQuestion } from '@taucad/chat';
import { TypedQuestionField } from '#components/chat/typed-question-field.js';

const question: AskedQuestion = {
  id: 'colors',
  question: 'Which colors?',
  allowsText: false,
  options: [
    { label: 'Same', value: 'red' },
    { label: 'Same', value: 'blue' },
  ],
  field: { type: 'array', required: true, minItems: 2, maxItems: 2 },
};

describe('typed question controls', () => {
  it('should keep multiple choices until explicit submission and show progress on the selected action', () => {
    const answer = vi.fn();
    const props = { question, isOpen: true, onHold: vi.fn(), onAnswer: answer };
    const view = render(<TypedQuestionField {...props} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Same' })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm selection' }));
    expect(answer).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('matches the requested limits');
    fireEvent.click(screen.getAllByRole('button', { name: 'Same' })[1]!);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm selection' }));
    expect(answer).toHaveBeenCalledWith({ value: ['red', 'blue'] });
    view.rerender(<TypedQuestionField {...props} isOpen={false} isPending />);
    expect(screen.getByRole('button', { name: 'Confirm selection' })).toHaveAttribute('aria-busy', 'true');
  });

  it('should reject fractional integers and preserve exact numeric values', () => {
    const answer = vi.fn();
    render(
      <TypedQuestionField
        question={{
          ...question,
          options: [],
          allowsText: true,
          field: { type: 'integer', required: true, minimum: 1, maximum: 5 },
        }}
        isOpen
        onHold={vi.fn()}
        onAnswer={answer}
      />,
    );
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '1.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send answer' }));
    expect(answer).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send answer' }));
    expect(answer).toHaveBeenCalledWith({ value: 3 });
  });

  it('should distinguish false from skipping an optional boolean', () => {
    const answer = vi.fn();
    render(
      <TypedQuestionField
        question={{ ...question, options: [], allowsText: false, field: { type: 'boolean', required: false } }}
        isOpen
        onHold={vi.fn()}
        onAnswer={answer}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'No' }));
    expect(answer).toHaveBeenLastCalledWith({ value: false });
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(answer).toHaveBeenLastCalledWith({ skipped: true });
  });
});

it('should not confuse provider values with the send action while pending', () => {
  const answer = vi.fn();
  const props = {
    question: {
      ...question,
      options: [{ label: 'Send value', value: 'send' }],
      allowsText: true,
      field: { type: 'string', required: true },
    } satisfies AskedQuestion,
    isOpen: true,
    onHold: vi.fn(),
    onAnswer: answer,
  };
  const view = render(<TypedQuestionField {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Send value' }));
  view.rerender(<TypedQuestionField {...props} isOpen={false} isPending />);
  expect(screen.getByRole('button', { name: 'Send value' })).toHaveAttribute('aria-busy', 'true');
  expect(screen.getByRole('button', { name: 'Send answer' })).toHaveAttribute('aria-busy', 'false');
});
