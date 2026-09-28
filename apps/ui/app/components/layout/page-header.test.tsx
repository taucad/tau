import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PageHeader } from '#components/layout/page-header.js';

describe('PageHeader', () => {
  it('should render one level-one heading at the policy step with the count outside its name', () => {
    render(<PageHeader title='Community' count={20} action={<button type='button'>New project</button>} />);

    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveAccessibleName('Community');
    expect(headings[0]).toHaveClass('text-4xl', 'leading-[1.1]', 'font-medium', 'tracking-tight');
    expect(screen.getByText('20')).toHaveClass('text-muted-foreground', 'tabular-nums');
    expect(screen.getByRole('button', { name: 'New project' })).toBeInTheDocument();
  });

  it('should wrap the title row and omit the count when none is given', () => {
    const { container } = render(<PageHeader title='Projects' />);

    expect(container.firstElementChild).toHaveClass('flex', 'flex-wrap', 'items-center', 'justify-between', 'gap-4');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^Projects$/u);
    expect(container.querySelector('.tabular-nums')).toBeNull();
  });
});
