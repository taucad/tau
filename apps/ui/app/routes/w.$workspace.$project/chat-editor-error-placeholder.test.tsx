import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ChatEditorErrorPlaceholder } from '#routes/w.$workspace.$project/chat-editor-error-placeholder.js';

describe('ChatEditorErrorPlaceholder', () => {
  it('should render the failure title', () => {
    render(<ChatEditorErrorPlaceholder cause={new Error('disk on fire')} />);

    expect(screen.getByText(/failed to load file/i)).toBeInTheDocument();
  });

  it('should render the message of an Error cause', () => {
    render(<ChatEditorErrorPlaceholder cause={new Error('disk on fire')} />);

    expect(screen.getByText(/disk on fire/)).toBeInTheDocument();
  });

  it('should render a string cause directly', () => {
    render(<ChatEditorErrorPlaceholder cause='network unavailable' />);

    expect(screen.getByText(/network unavailable/)).toBeInTheDocument();
  });

  it('should render a generic message for non-Error, non-string cause', () => {
    render(<ChatEditorErrorPlaceholder cause={{ unexpected: true }} />);

    expect(screen.getByText(/unknown error/i)).toBeInTheDocument();
  });
});
