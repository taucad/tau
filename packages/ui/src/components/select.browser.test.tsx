import '#components/select.browser.css';
import { useRef, useState } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@taucad/ui/components/select';

const rect = (element: Element) => {
  const { x, y, width, height } = element.getBoundingClientRect();
  return { x, y, width, height };
};

const options = ['First', 'Selected', 'Last'];
const cases = [
  { name: 'invitation role', size: 'default', width: 128, selected: 'First' },
  { name: 'collaborator role', size: 'sm', width: 112, selected: 'Selected' },
  { name: 'publication access', size: 'default', width: 144, selected: 'Last' },
  { name: 'account field', size: 'default', width: 320, selected: 'Selected' },
  { name: 'workspace recovery', size: 'default', width: 240 },
  { name: 'grouped presets', size: 'sm', width: 160, selected: 'Selected', grouped: true },
  { name: 'rich label', size: 'sm', width: 160, selected: 'Selected', rich: true },
  { name: 'RTL', size: 'sm', width: 160, selected: 'Selected', direction: 'rtl' },
  { name: 'RTL document', size: 'sm', width: 160, selected: 'Selected', direction: 'rtl', documentDirection: true },
] as const;

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove('dark');
  document.documentElement.removeAttribute('dir');
});

it.each(cases.flatMap((scenario) => ['light', 'dark'].map((theme) => ({ ...scenario, theme }))))(
  'should overlay $name without shifting in $theme',
  async (scenario) => {
    await page.viewport(800, 800);
    document.documentElement.classList.toggle('dark', scenario.theme === 'dark');
    if ('documentDirection' in scenario) {
      document.documentElement.dir = 'rtl';
    }
    const items = options.map((label) => (
      <SelectItem key={label} value={label}>
        <span className='flex min-w-0 items-center gap-2'>
          {'rich' in scenario ? (
            <svg role='img' aria-label='Material' viewBox='0 0 16 16'>
              <circle cx='8' cy='8' r='6' />
            </svg>
          ) : null}
          <span>{label}</span>
        </span>
      </SelectItem>
    ));
    render(
      <div style={{ padding: '220px 100px' }}>
        <Select
          size={scenario.size}
          dir={'direction' in scenario ? scenario.direction : undefined}
          defaultValue={'selected' in scenario ? scenario.selected : undefined}
        >
          <SelectTrigger aria-label={scenario.name} style={{ width: scenario.width }}>
            <SelectValue placeholder='Choose' />
          </SelectTrigger>
          <SelectContent>
            {'grouped' in scenario ? (
              <SelectGroup>
                <SelectLabel>Presets</SelectLabel>
                {items}
              </SelectGroup>
            ) : (
              items
            )}
            <SelectItem value='long'>An unselected option that is much longer than the trigger</SelectItem>
          </SelectContent>
        </Select>
        <button type='button'>After select</button>
      </div>,
    );
    const trigger = screen.getByRole('combobox', { name: scenario.name });
    const before = rect(trigger);
    const siblingElement = screen.getByRole('button', { name: 'After select' });
    const sibling = rect(siblingElement);
    const selectedLabel = 'selected' in scenario ? scenario.selected : 'First';
    const labelBefore = 'selected' in scenario ? rect(within(trigger).getByText(selectedLabel)) : undefined;
    const iconBefore = 'rich' in scenario ? rect(within(trigger).getByRole('img', { name: 'Material' })) : undefined;
    trigger.focus();
    await userEvent.keyboard('{ArrowDown}');
    const opened = await screen.findByRole('option', {
      name: selectedLabel === 'Selected' && iconBefore ? 'Material Selected' : selectedLabel,
    });
    expect(rect(opened)).toEqual(before);
    expect(getComputedStyle(opened).borderRadius).toBe(getComputedStyle(trigger).borderRadius);
    expect(getComputedStyle(opened).getPropertyValue('corner-shape')).toBe(
      getComputedStyle(trigger).getPropertyValue('corner-shape'),
    );
    if (labelBefore) {
      expect(rect(within(opened).getByText(selectedLabel))).toEqual(labelBefore);
    }
    if (iconBefore) {
      expect(rect(within(opened).getByRole('img', { name: 'Material' }))).toEqual(iconBefore);
    }
    expect(rect(trigger)).toEqual(before);
    expect(rect(siblingElement)).toEqual(sibling);
    await userEvent.keyboard('{Escape}');
    expect(rect(trigger)).toEqual(before);
    expect(document.activeElement).toBe(trigger);
    trigger.style.width = '200px';
    const resized = rect(trigger);
    await page.getByRole('combobox', { name: scenario.name }).click();
    expect(
      rect(
        await screen.findByRole('option', {
          name: selectedLabel === 'Selected' && iconBefore ? 'Material Selected' : selectedLabel,
        }),
      ),
    ).toEqual(resized);
  },
);

it('should align controlled and initially open selects and preserve forwarded refs', async () => {
  function Controlled(): React.JSX.Element {
    const [isOpen, setIsOpen] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);
    return (
      <div style={{ padding: '220px 100px' }}>
        <button
          type='button'
          onClick={() => {
            if (triggerRef.current) {
              triggerRef.current.style.width = '180px';
            }
            setIsOpen(true);
          }}
        >
          Open externally
        </button>
        <Select open={isOpen} onOpenChange={setIsOpen} defaultValue='first'>
          <SelectTrigger ref={triggerRef} aria-label='Controlled' style={{ width: 140 }}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='first'>First</SelectItem>
            <SelectItem value='last'>Last</SelectItem>
          </SelectContent>
        </Select>
      </div>
    );
  }
  await page.viewport(800, 800);
  render(<Controlled />);
  await page.getByRole('button', { name: 'Open externally' }).click();
  expect(rect(await screen.findByRole('option', { name: 'First' }))).toEqual(rect(screen.getByLabelText('Controlled')));
  cleanup();
  render(
    <div style={{ padding: '220px 100px' }}>
      <Select defaultOpen defaultValue='first'>
        <SelectTrigger aria-label='Initially open' style={{ width: 140 }}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='first'>First</SelectItem>
          <SelectItem value='last'>Last</SelectItem>
        </SelectContent>
      </Select>
    </div>,
  );
  expect(rect(await screen.findByRole('option', { name: 'First' }))).toEqual(
    rect(screen.getByLabelText('Initially open')),
  );
});
