import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Tabs, TabsList, TabsTrigger } from '#components/tabs.js';

describe('TabsTrigger', () => {
  it('slots an active indicator into an asChild trigger', () => {
    render(
      <Tabs defaultValue='general'>
        <TabsList>
          <TabsTrigger asChild value='general'>
            <a href='/settings'>General</a>
          </TabsTrigger>
        </TabsList>
      </Tabs>,
    );

    const trigger = screen.getByRole('tab', { name: 'General' });
    expect(trigger).toHaveAttribute('href', '/settings');
    expect(trigger.querySelector('[data-slot="tabs-active-indicator"]')).toBeInTheDocument();
  });
});
