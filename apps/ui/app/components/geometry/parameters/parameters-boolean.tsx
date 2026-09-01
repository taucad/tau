import { Switch } from '@taucad/ui/components/switch';
import { cn } from '@taucad/ui/utils/cn';

type ParametersBooleanProps = {
  // oxlint-disable-next-line react-js/boolean-prop-naming -- third-party component prop
  readonly value: boolean;
  readonly onChange: (value: boolean) => void;
  readonly name?: string;
} & Omit<React.ComponentProps<typeof Switch>, 'value' | 'onChange'>;

export function ParametersBoolean({ value, onChange, ...properties }: ParametersBooleanProps): React.JSX.Element {
  return (
    <Switch
      size='md'
      className={cn(
        'border-border/50 transition-colors hover:border-border',
        'data-[state=unchecked]:bg-muted',
        'data-[state=checked]:bg-primary/15 hover:data-[state=checked]:bg-primary/40',
      )}
      checked={Boolean(value)}
      onCheckedChange={(checkedValue) => {
        onChange(checkedValue);
      }}
      {...properties}
    />
  );
}
