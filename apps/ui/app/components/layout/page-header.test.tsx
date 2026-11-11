import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PageHeader, PhoneTopBarContext, SectionHeader } from '#components/layout/page-header.js';

const titleInPhoneBar = { hasTitle: true, hasAction: false } as const;

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

  it('should hide only the heading below md while the phone bar shows it, keeping the h1 and count', () => {
    render(
      <PhoneTopBarContext.Provider value={titleInPhoneBar}>
        <PageHeader title='Community' count={20} />
      </PhoneTopBarContext.Provider>,
    );

    const heading = screen.getByRole('heading', { level: 1, name: 'Community' });
    expect(heading).toHaveClass('max-md:sr-only');
    // The count stays on screen at every width (I1); only the repeated title hides.
    expect(screen.getByText('20').closest('[class*="sr-only"]')).toBeNull();
  });
});

describe('SectionHeader', () => {
  it('should render a section at its level without adding a second page heading', () => {
    render(
      <>
        <h1>Home</h1>
        <SectionHeader level={2} title='Projects' count={3} action={<a href='/projects'>View all</a>} />
      </>,
    );

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    const section = screen.getByRole('heading', { level: 2, name: 'Projects' });
    expect(section).toHaveClass('text-2xl', 'font-semibold', 'tracking-tight');
    expect(section).not.toHaveClass('text-4xl');
    expect(screen.getByText('3')).toHaveClass('text-muted-foreground', 'tabular-nums');
    expect(screen.getByRole('link', { name: 'View all' })).toBeInTheDocument();
  });

  it('should keep the section look one level down', () => {
    render(<SectionHeader level={3} title='Examples' />);

    expect(screen.getByRole('heading', { level: 3, name: 'Examples' })).toHaveClass('text-2xl', 'font-semibold');
  });

  it('should stay visible under the phone bar, which repeats only the page title', () => {
    render(
      <PhoneTopBarContext.Provider value={titleInPhoneBar}>
        <SectionHeader level={2} title='Projects' />
      </PhoneTopBarContext.Provider>,
    );

    expect(screen.getByRole('heading', { level: 2, name: 'Projects' })).not.toHaveClass('max-md:sr-only');
  });
});
