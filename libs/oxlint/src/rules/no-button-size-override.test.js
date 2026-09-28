import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { noButtonSizeOverrideRule } from './no-button-size-override.js';

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

describe('no-button-size-override', () => {
  it('reports violations and accepts valid code', () => {
    ruleTester.run('no-button-size-override', noButtonSizeOverrideRule, {
      valid: [
        { name: 'size variant only', code: "<Button size='icon-sm' />" },
        { name: 'layout width', code: "<Button className='w-full justify-start' />" },
        { name: 'responsive intent', code: "<Button className='md:h-9' />" },
        { name: 'colour and gap', code: "<Button className='gap-2 text-muted-foreground' />" },
        { name: 'not a Button', code: "<div className='h-8 px-2 text-sm' />" },
        { name: 'dynamic className', code: '<Button className={className} />' },
      ],
      invalid: [
        {
          name: 'height override',
          code: "<Button size='sm' className='h-7 gap-1' />",
          errors: [
            {
              messageId: 'violation',
              data: { found: 'h-7' },
              suggestions: [
                { messageId: 'remove', data: { found: 'h-7' }, output: "<Button size='sm' className='gap-1' />" },
              ],
            },
          ],
        },
        {
          name: 'padding and text size through cn',
          code: "<Button className={cn('px-2 text-xs', isActive && 'size-8')} />",
          errors: [
            {
              messageId: 'violation',
              data: { found: 'px-2' },
              suggestions: [
                { messageId: 'remove', output: "<Button className={cn('text-xs', isActive && 'size-8')} />" },
              ],
            },
            {
              messageId: 'violation',
              data: { found: 'text-xs' },
              suggestions: [
                { messageId: 'remove', output: "<Button className={cn('px-2 ', isActive && 'size-8')} />" },
              ],
            },
            {
              messageId: 'violation',
              data: { found: 'size-8' },
              suggestions: [
                { messageId: 'remove', output: "<Button className={cn('px-2 text-xs', isActive && '')} />" },
              ],
            },
          ],
        },
      ],
    });
  });
});
