import { useId } from 'react';
import { Tags, TagsTrigger } from '@taucad/ui-kit/components/input-tags';
import { Label } from '@taucad/ui/components/label';
import { cn } from '@taucad/ui/utils/cn';

export const maxPublicationAccessRecipients = 50;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export function normalizePublicationEmailTags(tags: readonly string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))];
}

export function isPublicationEmailTag(value: string): boolean {
  return emailPattern.test(value);
}

export function getPublicationEmailTagsError(tags: readonly string[]): string | undefined {
  if (tags.length > maxPublicationAccessRecipients) {
    return `You can invite up to ${maxPublicationAccessRecipients.toString()} people.`;
  }

  const invalid = tags.find((tag) => !isPublicationEmailTag(tag));
  if (invalid) {
    return `Enter a valid email: ${invalid}`;
  }

  return undefined;
}

export type PublicationEmailTagsFieldProps = {
  readonly id: string;
  readonly label: string;
  /** One line under the field that says what happens to the addresses; the input is described by it. */
  readonly description?: string;
  readonly emails: string[];
  readonly onEmailsChange: (emails: string[]) => void;
  // oxlint-disable-next-line react-js/boolean-prop-naming -- mirrors native input prop.
  readonly disabled?: boolean;
  readonly placeholder?: string;
  readonly className?: string;
};

export function PublicationEmailTagsField({
  id,
  label,
  description,
  emails,
  onEmailsChange,
  disabled,
  placeholder = 'teammate@example.com',
  className,
}: PublicationEmailTagsFieldProps): React.JSX.Element {
  const error = getPublicationEmailTagsError(emails);
  const descriptionId = useId();
  const errorId = useId();
  const describedBy = [description === undefined ? undefined : descriptionId, error ? errorId : undefined]
    .filter((part) => part !== undefined)
    .join(' ');

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Label htmlFor={id}>{label}</Label>
      <Tags
        tags={emails}
        onTagsChange={(nextEmails) => {
          onEmailsChange(normalizePublicationEmailTags(nextEmails));
        }}
      >
        <TagsTrigger
          id={id}
          inputAriaLabel={label}
          inputAriaDescribedBy={describedBy === '' ? undefined : describedBy}
          placeholder={placeholder}
          disabled={disabled}
        />
      </Tags>
      {description === undefined ? null : (
        <p id={descriptionId} className='text-xs text-muted-foreground'>
          {description}
        </p>
      )}
      {error ? (
        <p id={errorId} className='text-xs text-feature'>
          {error}
        </p>
      ) : null}
    </div>
  );
}
