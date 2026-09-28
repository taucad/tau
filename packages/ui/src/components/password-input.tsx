import * as React from 'react';
import { Eye, EyeOff } from 'lucide-react';

import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '#components/input-group.js';

/**
 * A password input with a toggle that shows or hides what was typed.
 * The toggle is a labelled button that reports its state through `aria-pressed`.
 *
 * @public
 * @example <caption>Render a password field.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { PasswordInput } from '@taucad/ui/components/password-input';
 *
 * createElement(PasswordInput, { name: 'accessCode', required: true });
 * ```
 */
function PasswordInput({
  className,
  disabled,
  ...props
}: Omit<React.ComponentProps<'input'>, 'type'>): React.JSX.Element {
  const [isVisible, setIsVisible] = React.useState(false);
  return (
    <InputGroup className={className} data-disabled={disabled}>
      <InputGroupInput type={isVisible ? 'text' : 'password'} disabled={disabled} {...props} />
      <InputGroupAddon align='inline-end'>
        <InputGroupButton
          size='icon-xs'
          aria-label={isVisible ? 'Hide password' : 'Show password'}
          aria-pressed={isVisible}
          disabled={disabled}
          onClick={() => {
            setIsVisible((visible) => !visible);
          }}
        >
          {isVisible ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}

export { PasswordInput };
