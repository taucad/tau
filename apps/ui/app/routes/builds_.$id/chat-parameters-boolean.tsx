import { Switch } from '#components/ui/switch.js';

type ChatParametersBooleanProps = {
  // eslint-disable-next-line react/boolean-prop-naming -- not relevant
  readonly value: boolean;
  readonly onChange: (value: boolean) => void;
};

export function ChatParametersBoolean({ value, onChange }: ChatParametersBooleanProps): React.JSX.Element {
  return (
    <Switch
      size="lg"
      checked={Boolean(value)}
      onCheckedChange={(checkedValue) => {
        onChange(checkedValue);
      }}
    />
  );
}
