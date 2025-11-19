import { Switch } from '#components/ui/switch.js';

type ParametersBooleanProps = {
  // eslint-disable-next-line react/boolean-prop-naming -- not relevant
  readonly value: boolean;
  readonly onChange: (value: boolean) => void;
  readonly name?: string;
} & Omit<React.ComponentProps<typeof Switch>, 'value' | 'onChange'>;

export function ParametersBoolean({ value, onChange, ...properties }: ParametersBooleanProps): React.JSX.Element {
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
