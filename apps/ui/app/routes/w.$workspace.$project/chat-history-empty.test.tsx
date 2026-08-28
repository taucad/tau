// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChatHistoryEmpty } from '#routes/w.$workspace.$project/chat-history-empty.js';

describe('ChatHistoryEmpty', () => {
  it('renders one concise CAD invitation without the old tips panel', () => {
    render(<ChatHistoryEmpty />);

    expect(screen.getByRole('heading', { name: 'What would you like to build?' })).toBeInTheDocument();
    expect(screen.getByText(/Describe the shape, dimensions, materials, or constraints/)).toBeInTheDocument();
    expect(screen.queryByText('Tips for best results')).not.toBeInTheDocument();
  });
});
