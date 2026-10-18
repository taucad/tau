import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '#components/drawer.js';

describe('DrawerContent', () => {
  it('should give list rows a 44px touch height and keep the caller className', () => {
    render(
      <Drawer open>
        <DrawerContent className='custom-drawer'>
          <DrawerTitle>Pick</DrawerTitle>
          <DrawerDescription>Pick one.</DrawerDescription>
        </DrawerContent>
      </Drawer>,
    );

    const content = screen.getByRole('dialog');
    expect(content).toHaveClass('[&_[data-slot=command-item]]:min-h-10', 'custom-drawer');
  });
});
