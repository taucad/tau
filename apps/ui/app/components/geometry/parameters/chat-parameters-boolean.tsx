import { Switch } from '#components/ui/switch.js';

type ChatParametersBooleanProps = {
  // eslint-disable-next-line react/boolean-prop-naming -- not relevant
  readonly value: boolean;
  readonly onChange: (value: boolean) => void;
  readonly name?: string;
} & Omit<React.ComponentProps<typeof Switch>, 'value' | 'onChange'>;

export function ChatParametersBoolean({
  value,
  onChange,
  ...properties
}: ChatParametersBooleanProps): React.JSX.Element {
  return (
    <Switch
      size="md"
      checked={Boolean(value)}
      onCheckedChange={(checkedValue) => {
        onChange(checkedValue);
      }}
      {...properties}
    />
  );
}
