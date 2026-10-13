// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { describe, expect, it, vi } from 'vitest';
import OpenSourceNotices from '#routes/legal.open-source/route.js';

vi.mock('#hooks/use-theme.js', () => ({ useTheme: () => ({ isHighContrast: false }) }));

describe('Open-source notices route', () => {
  it('credits the MIT components of the desktop C# runtime and reproduces the MIT License', async () => {
    render(
      <MemoryRouter initialEntries={['/legal/open-source']}>
        <TooltipProvider>
          <OpenSourceNotices />
        </TooltipProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: /^Desktop C# Runtime/u })).toBeInTheDocument();
    const runtimeTable = screen
      .getAllByRole('table')
      .find((table) => within(table).queryByText('Microsoft.CodeAnalysis.CSharp') !== null);
    expect(runtimeTable).toBeDefined();
    for (const component of ['.NET Runtime', 'Roslyn', 'SkiaSharp']) {
      expect(within(runtimeTable!).getByRole('link', { name: component })).toBeInTheDocument();
    }
    expect(screen.getByRole('heading', { name: /^MIT License/u })).toBeInTheDocument();
    expect(screen.getByText(/Permission is hereby granted, free of charge/u)).toBeInTheDocument();
  });
});
