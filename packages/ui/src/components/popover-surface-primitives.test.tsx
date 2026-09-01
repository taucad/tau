// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Popover, PopoverContent, PopoverTrigger } from '#components/popover.js';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '#components/hover-card.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#components/select.js';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '#components/tooltip.js';
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuList,
  NavigationMenuTrigger,
} from '#components/navigation-menu.js';
import { Command } from '#components/command.js';
import { popoverSurfaceVariants } from '#components/popover.variants.js';

Element.prototype.scrollIntoView = vi.fn();

const expectSurfaceAppearance = (element: HTMLElement, appearance: 'panel' | 'picker' | 'inverse'): void => {
  expect(element).toHaveClass(...popoverSurfaceVariants({ appearance }).split(' '));
};

describe('popover-style primitives', () => {
  it('applies panel chrome to popovers and hover cards', () => {
    render(
      <>
        <Popover open>
          <PopoverTrigger>Open popover</PopoverTrigger>
          <PopoverContent>Popover surface</PopoverContent>
        </Popover>
        <HoverCard open>
          <HoverCardTrigger>Open hover card</HoverCardTrigger>
          <HoverCardContent>Hover-card surface</HoverCardContent>
        </HoverCard>
      </>,
    );

    expectSurfaceAppearance(screen.getByText('Popover surface'), 'panel');
    expectSurfaceAppearance(screen.getByText('Hover-card surface'), 'panel');
  });

  it('applies picker chrome to Radix Select', () => {
    render(
      <Select open value='one'>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='one'>Select option</SelectItem>
        </SelectContent>
      </Select>,
    );

    expectSurfaceAppearance(document.querySelector<HTMLElement>('[data-slot="select-content"]')!, 'picker');
  });

  it('applies inverse chrome to tooltips', () => {
    render(
      <TooltipProvider>
        <Tooltip open>
          <TooltipTrigger>Open tooltip</TooltipTrigger>
          <TooltipContent>Tooltip surface</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );

    expectSurfaceAppearance(document.querySelector<HTMLElement>('[data-slot="tooltip-content"]')!, 'inverse');
  });

  it('applies panel chrome directly when a navigation menu has no viewport', () => {
    render(
      <NavigationMenu hasViewport={false} value='surface'>
        <NavigationMenuList>
          <NavigationMenuItem value='surface'>
            <NavigationMenuTrigger>Open navigation</NavigationMenuTrigger>
            <NavigationMenuContent forceMount>Navigation surface</NavigationMenuContent>
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>,
    );

    expectSurfaceAppearance(screen.getByText('Navigation surface'), 'panel');
  });

  it('applies panel chrome to the shared navigation-menu viewport', () => {
    render(
      <NavigationMenu value='surface'>
        <NavigationMenuList>
          <NavigationMenuItem value='surface'>
            <NavigationMenuTrigger>Open navigation</NavigationMenuTrigger>
            <NavigationMenuContent forceMount>Navigation surface</NavigationMenuContent>
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>,
    );

    expectSurfaceAppearance(document.querySelector<HTMLElement>('[data-slot="navigation-menu-viewport"]')!, 'panel');
    expect(screen.getByText('Navigation surface')).not.toHaveClass('rounded-md');
  });

  it('lets nested Command shells inherit their container radius', () => {
    render(<Command>Command content</Command>);

    expect(screen.getByText('Command content')).toHaveClass('rounded-[inherit]');
  });
});
