import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { cva } from 'class-variance-authority';
import type { VariantProps } from 'class-variance-authority';

import { cn } from '#utils/cn.js';
import { Label } from '#components/label.js';
import { Separator } from '#components/separator.js';

/**
 * Groups related form fields with an accessible legend.
 *
 * @public
 * @example <caption>Render a field set.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { FieldSet } from '@taucad/ui/components/field';
 *
 * createElement(FieldSet);
 * ```
 */
function FieldSet({ className, ...props }: React.ComponentProps<'fieldset'>): React.JSX.Element {
  return (
    <fieldset
      data-slot='field-set'
      className={cn(
        'flex flex-col gap-6',
        'has-[>[data-slot=checkbox-group]]:gap-3 has-[>[data-slot=radio-group]]:gap-3',
        className,
      )}
      {...props}
    />
  );
}

/**
 * Names a {@link FieldSet}.
 *
 * @public
 * @example <caption>Render a field-set legend.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { FieldLegend } from '@taucad/ui/components/field';
 *
 * createElement(FieldLegend, null, 'Notifications');
 * ```
 */
function FieldLegend({
  className,
  variant = 'legend',
  ...props
}: React.ComponentProps<'legend'> & { variant?: 'legend' | 'label' }): React.JSX.Element {
  return (
    <legend
      data-slot='field-legend'
      data-variant={variant}
      className={cn('mb-3 font-medium', 'data-[variant=legend]:text-base', 'data-[variant=label]:text-sm', className)}
      {...props}
    />
  );
}

/**
 * Arranges a related collection of form fields.
 *
 * @public
 * @example <caption>Render a field group.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { FieldGroup } from '@taucad/ui/components/field';
 *
 * createElement(FieldGroup);
 * ```
 */
function FieldGroup({ className, ...props }: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      data-slot='field-group'
      className={cn(
        'group/field-group @container/field-group flex w-full flex-col gap-7 data-[slot=checkbox-group]:gap-3 [&>[data-slot=field-group]]:gap-4',
        className,
      )}
      {...props}
    />
  );
}

const fieldVariants = cva('group/field flex w-full gap-3 data-[invalid=true]:text-destructive', {
  variants: {
    orientation: {
      vertical: ['flex-col [&>*]:w-full [&>.sr-only]:w-auto'],
      horizontal: [
        'flex-row items-center',
        '[&>[data-slot=field-label]]:flex-auto',
        'has-[>[data-slot=field-content]]:items-start has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px',
      ],
      responsive: [
        'flex-col @md/field-group:flex-row @md/field-group:items-center [&>*]:w-full @md/field-group:[&>*]:w-auto [&>.sr-only]:w-auto',
        '@md/field-group:[&>[data-slot=field-label]]:flex-auto',
        '@md/field-group:has-[>[data-slot=field-content]]:items-start @md/field-group:has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px',
      ],
    },
  },
  defaultVariants: {
    orientation: 'vertical',
  },
});

/**
 * Arranges one control with its label, description, and error message.
 *
 * @public
 * @example <caption>Render a horizontal field.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { Field } from '@taucad/ui/components/field';
 *
 * createElement(Field, { orientation: 'horizontal' });
 * ```
 */
function Field({
  className,
  orientation = 'vertical',
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof fieldVariants>): React.JSX.Element {
  return (
    <div
      role='group'
      data-slot='field'
      data-orientation={orientation}
      className={cn(fieldVariants({ orientation }), className)}
      {...props}
    />
  );
}

/**
 * Stacks the descriptive content for a form field.
 *
 * @public
 * @example <caption>Render field content.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { FieldContent } from '@taucad/ui/components/field';
 *
 * createElement(FieldContent, null, 'Account name');
 * ```
 */
function FieldContent({ className, ...props }: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      data-slot='field-content'
      className={cn('group/field-content flex flex-1 flex-col gap-1.5 leading-snug', className)}
      {...props}
    />
  );
}

/**
 * Labels a form control and forwards native label behavior.
 *
 * @public
 * @example <caption>Associate a label with an input.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { FieldLabel } from '@taucad/ui/components/field';
 *
 * createElement(FieldLabel, { htmlFor: 'name' }, 'Name');
 * ```
 */
function FieldLabel({ className, ...props }: React.ComponentProps<typeof Label>): React.JSX.Element {
  return (
    <Label
      data-slot='field-label'
      className={cn(
        'group/field-label peer/field-label flex w-fit gap-2 leading-snug group-data-[disabled=true]/field:opacity-50',
        'has-[>[data-slot=field]]:w-full has-[>[data-slot=field]]:flex-col has-[>[data-slot=field]]:rounded-md has-[>[data-slot=field]]:border [&>*]:data-[slot=field]:p-4',
        'has-data-[state=checked]:border-primary has-data-[state=checked]:bg-primary/5 dark:has-data-[state=checked]:bg-primary/10',
        className,
      )}
      {...props}
    />
  );
}

/**
 * Displays a non-label title within composite field content.
 *
 * @public
 * @example <caption>Render a field title.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { FieldTitle } from '@taucad/ui/components/field';
 *
 * createElement(FieldTitle, null, 'Email updates');
 * ```
 */
function FieldTitle({ className, ...props }: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      data-slot='field-label'
      className={cn(
        'flex w-fit items-center gap-2 text-sm leading-snug font-medium group-data-[disabled=true]/field:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

/**
 * Provides supporting or instructional text for a field.
 *
 * @public
 * @example <caption>Describe a field.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { FieldDescription } from '@taucad/ui/components/field';
 *
 * createElement(FieldDescription, null, 'Shown on your profile.');
 * ```
 */
function FieldDescription({ className, ...props }: React.ComponentProps<'p'>): React.JSX.Element {
  return (
    <p
      data-slot='field-description'
      className={cn(
        'text-sm leading-normal font-normal text-muted-foreground group-has-[[data-orientation=horizontal]]/field:text-balance',
        'last:mt-0 nth-last-2:-mt-1 [[data-variant=legend]+&]:-mt-1.5',
        '[&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-primary',
        className,
      )}
      {...props}
    />
  );
}

/**
 * Separates field sections with optional centered text.
 *
 * @public
 * @example <caption>Separate optional fields.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { FieldSeparator } from '@taucad/ui/components/field';
 *
 * createElement(FieldSeparator, null, 'Optional');
 * ```
 */
function FieldSeparator({
  children,
  className,
  ...props
}: React.ComponentProps<'div'> & {
  children?: React.ReactNode;
}): React.JSX.Element {
  return (
    <div
      data-slot='field-separator'
      data-content={Boolean(children)}
      className={cn('relative -my-2 h-5 text-sm group-data-[variant=outline]/field-group:-mb-2', className)}
      {...props}
    >
      <Separator className='absolute inset-0 top-1/2' />
      {children && (
        <span
          className='relative mx-auto block w-fit bg-background px-2 text-muted-foreground'
          data-slot='field-separator-content'
        >
          {children}
        </span>
      )}
    </div>
  );
}

/**
 * Announces one or more deduplicated validation errors.
 *
 * @public
 * @example <caption>Render a field validation error.</caption>
 * ```typescript
 * import { createElement } from 'react';
 * import { FieldError } from '@taucad/ui/components/field';
 *
 * createElement(FieldError, { errors: [{ message: 'Name is required.' }] });
 * ```
 */
function FieldError({
  className,
  children,
  errors,
  ...props
}: React.ComponentProps<'div'> & {
  errors?: Array<{ message?: string } | undefined>;
}): React.JSX.Element | undefined {
  const content = useMemo((): ReactNode => {
    if (children) {
      return children;
    }

    if (!errors?.length) {
      return null;
    }

    const uniqueErrors = [...new Map(errors.map((error) => [error?.message, error])).values()];

    if (uniqueErrors.length === 1) {
      return uniqueErrors[0]?.message;
    }

    return (
      <ul className='ml-4 flex list-disc flex-col gap-1'>
        {uniqueErrors.map((error) => error?.message && <li key={error.message}>{error.message}</li>)}
      </ul>
    );
  }, [children, errors]);

  if (!content) {
    return undefined;
  }

  return (
    <div
      role='alert'
      data-slot='field-error'
      className={cn('text-sm font-normal text-destructive', className)}
      {...props}
    >
      {content}
    </div>
  );
}

export {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldContent,
  FieldTitle,
};
