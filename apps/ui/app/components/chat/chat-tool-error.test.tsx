import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { TriangleAlert } from 'lucide-react';
import type { ToolExecutionError } from '@taucad/chat';
import { ChatToolError } from '#components/chat/chat-tool-error.js';

vi.mock('#hooks/use-cookie.js', () => ({
  useCookie: (_name: string, defaultValue: boolean) => [defaultValue, vi.fn(), vi.fn()],
}));

const defaultNoun = 'file read';

const createError = (
  errorCode: ToolExecutionError['errorCode'],
  overrides: Partial<ToolExecutionError> = {},
): ToolExecutionError => {
  // oxlint-disable-next-line typescript-eslint(consistent-type-assertions) -- test factory for discriminated union
  return {
    errorCode,
    message: 'Test error message',
    toolName: 'read_file',
    toolCallId: 'call-1',
    ...overrides,
  } as ToolExecutionError;
};

const renderParsed = (error: ToolExecutionError, noun = defaultNoun): ReturnType<typeof render> =>
  render(<ChatToolError errorText={JSON.stringify(error)} icon={TriangleAlert} noun={noun} />);

describe('ChatToolError parsed errors', () => {
  it('should not apply destructive tone on the leading icon for TOOL_EXECUTION_ERROR', () => {
    renderParsed(createError('TOOL_EXECUTION_ERROR'));

    const trigger = screen.getByRole('button');
    expect(trigger.className).not.toContain('text-destructive');

    const icon = trigger.querySelector('svg');
    expect(icon?.getAttribute('class') ?? '').not.toContain('text-destructive');
  });

  it('should render Attempted with caller noun for TOOL_EXECUTION_ERROR', () => {
    renderParsed(createError('TOOL_EXECUTION_ERROR'), 'web visit');

    expect(screen.getByText('Attempted')).toBeInTheDocument();
    expect(screen.getByText('web visit')).toBeInTheDocument();
    expect(screen.queryByText('web_browser')).not.toBeInTheDocument();
  });

  it('should render with muted card status and no destructive icon for TOOL_NO_RESULTS', () => {
    renderParsed(createError('TOOL_NO_RESULTS'));

    const trigger = screen.getByRole('button');
    expect(trigger.className).not.toContain('text-destructive');

    const icon = trigger.querySelector('svg');
    expect(icon?.getAttribute('class') ?? '').not.toContain('text-destructive');
    expect(screen.getByText('No results from')).toBeInTheDocument();
  });

  it('should render Stopped for USER_INTERRUPTED without destructive icon', () => {
    renderParsed(createError('USER_INTERRUPTED'));

    expect(screen.getByText('Stopped')).toBeInTheDocument();
    const icon = screen.getByRole('button').querySelector('svg');
    expect(icon?.getAttribute('class') ?? '').not.toContain('text-destructive');
  });

  it('should render Stream interrupted during for STREAM_ERROR', () => {
    renderParsed(createError('STREAM_ERROR'));

    expect(screen.getByText('Stream interrupted during')).toBeInTheDocument();
    const icon = screen.getByRole('button').querySelector('svg');
    expect(icon?.getAttribute('class') ?? '').not.toContain('text-destructive');
  });

  it('should render Connection lost during for CLIENT_DISCONNECTED', () => {
    renderParsed(createError('CLIENT_DISCONNECTED'));

    expect(screen.getByText('Connection lost during')).toBeInTheDocument();
  });

  it('should render every error inside a collapsible (trigger present, body initially closed)', () => {
    renderParsed(createError('TOOL_NO_RESULTS'));

    expect(screen.getByRole('button')).toBeInTheDocument();
    expect(screen.queryByText('Test error message')).not.toBeInTheDocument();
  });

  it('should render verb and noun in the header with proper inline spacing via ChatToolLabel', () => {
    renderParsed(createError('TOOL_EXECUTION_ERROR'), 'web visit');

    const verb = screen.getByText('Attempted');
    const labelWrapper = verb.parentElement;
    expect(labelWrapper).not.toBeNull();
    expect(labelWrapper?.tagName).toBe('SPAN');

    const description = screen.getByText('web visit');
    expect(description).toHaveClass('text-foreground/50');
    expect(description.className).not.toContain('font-mono');

    expect(labelWrapper?.textContent).toBe('Attempted web visit');
  });

  it('should put the error description inside the collapsible body, not the header', async () => {
    renderParsed(createError('TOOL_EXECUTION_ERROR'));

    expect(screen.queryByText('Test error message')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button'));

    expect(screen.getByText('Test error message')).toBeInTheDocument();
  });

  it('should render the validation errors block inside the body when expanded', async () => {
    const error = createError('TOOL_INPUT_VALIDATION_FAILED', {
      validationErrors: [{ path: 'input.name', message: 'Required' }],
    });
    renderParsed(error);

    expect(screen.queryByText('Validation errors:')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button'));

    expect(screen.getByText('Validation errors:')).toBeInTheDocument();
    expect(screen.getByText('input.name')).toBeInTheDocument();
    expect(screen.getByText(/Required/)).toBeInTheDocument();
  });
});

describe('ChatToolError unparseable fallback', () => {
  it('should render Attempted with caller noun in the header', () => {
    render(<ChatToolError errorText='not json at all' icon={TriangleAlert} noun='file read' />);

    expect(screen.getByText('Attempted')).toBeInTheDocument();
    expect(screen.getByText('file read')).toBeInTheDocument();
  });

  it('should not apply destructive tone on the icon', () => {
    render(<ChatToolError errorText='not json at all' icon={TriangleAlert} noun='file read' />);

    const trigger = screen.getByRole('button');
    expect(trigger.className).not.toContain('text-destructive');

    const icon = trigger.querySelector('svg');
    expect(icon?.getAttribute('class') ?? '').not.toContain('text-destructive');
  });

  it('should render the fallback inside a collapsible (trigger present, raw text initially hidden)', () => {
    render(<ChatToolError errorText='raw error blob' icon={TriangleAlert} noun='file read' />);

    expect(screen.getByRole('button')).toBeInTheDocument();
    expect(screen.queryByText('raw error blob')).not.toBeInTheDocument();
  });

  it('should reveal the raw errorText in the body after expanding the fallback', async () => {
    render(<ChatToolError errorText='raw error blob' icon={TriangleAlert} noun='file read' />);

    await userEvent.click(screen.getByRole('button'));

    expect(screen.getByText('raw error blob')).toBeInTheDocument();
  });
});
