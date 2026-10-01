// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Popover, PopoverContent, PopoverTrigger } from '#components/popover.js';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '#components/tooltip.js';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '#components/dropdown-menu.js';
import { Select, SelectContent, SelectItem, SelectTrigger } from '#components/select.js';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '#components/dialog.js';

afterEach(() => {
  Reflect.deleteProperty(document, 'fullscreenElement');
});

describe('fullscreen overlays', () => {
  it.each([
    [
      'popover',
      <Popover open key='popover'>
        <PopoverTrigger>Open</PopoverTrigger>
        <PopoverContent>Overlay</PopoverContent>
      </Popover>,
    ],
    [
      'tooltip',
      <TooltipProvider key='tooltip'>
        <Tooltip open>
          <TooltipTrigger>Open</TooltipTrigger>
          <TooltipContent>Overlay</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    ],
    [
      'menu',
      <DropdownMenu open key='menu'>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Overlay</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    ],
    [
      'select',
      <Select open key='select'>
        <SelectTrigger>Open</SelectTrigger>
        <SelectContent>
          <SelectItem value='one'>Overlay</SelectItem>
        </SelectContent>
      </Select>,
    ],
    [
      'dialog',
      <Dialog open key='dialog'>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent>
          <DialogTitle>Overlay</DialogTitle>
          <DialogDescription>Details</DialogDescription>
        </DialogContent>
      </Dialog>,
    ],
  ] as const)('should keep overlay %s visible through fullscreen entry and exit after mounting', (_name, overlay) => {
    let fullscreenElement: Element | undefined;
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => fullscreenElement });
    const { container } = render(<div>{overlay}</div>);
    const viewer = container.firstElementChild!;

    expect(viewer).not.toContainElement(screen.getAllByText('Overlay')[0]!);
    act(() => {
      fullscreenElement = viewer;
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    expect(viewer).toContainElement(screen.getAllByText('Overlay')[0]!);
    act(() => {
      fullscreenElement = undefined;
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    expect(viewer).not.toContainElement(screen.getAllByText('Overlay')[0]!);
  });
});
