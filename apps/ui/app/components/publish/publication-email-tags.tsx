import { Tags, TagsTrigger } from '#components/ui/input-tags.js';
import { Label } from '#components/ui/label.js';
import { cn } from '#utils/ui.utils.js';

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
    return `Share with up to ${maxPublicationAccessRecipients.toString()} emails.`;
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
  readonly emails: string[];
  readonly onEmailsChange: (emails: string[]) => void;
  readonly disabled?: boolean;
  readonly placeholder?: string;
  readonly className?: string;
};

export function PublicationEmailTagsField({
  id,
  label,
  emails,
  onEmailsChange,
  disabled,
  placeholder = 'teammate@example.com',
  className,
}: PublicationEmailTagsFieldProps): React.JSX.Element {
  const error = getPublicationEmailTagsError(emails);

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Label htmlFor={id}>{label}</Label>
      <Tags
        tags={emails}
        onTagsChange={(nextEmails) => {
          onEmailsChange(normalizePublicationEmailTags(nextEmails));
        }}
      >
        <TagsTrigger id={id} inputAriaLabel={label} placeholder={placeholder} disabled={disabled} />
      </Tags>
      {error ? <p className='text-xs text-destructive'>{error}</p> : null}
    </div>
  );
}
