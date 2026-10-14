import { Switch } from '@taucad/ui/components/switch';

type ParametersBooleanProps = {
  // oxlint-disable-next-line react-js/boolean-prop-naming -- third-party component prop
  readonly value: boolean;
  readonly onChange: (value: boolean) => void;
  readonly name?: string;
} & Omit<React.ComponentProps<typeof Switch>, 'value' | 'onChange'>;

/**
 * A switch that edits a boolean parameter.
 *
 * @param properties - The value, change handler and switch props.
 * @returns The switch.
 * @public
 */
export function ParametersBoolean({ value, onChange, ...properties }: ParametersBooleanProps): React.JSX.Element {
  return (
    <Switch
      size='md'
      checked={Boolean(value)}
      onCheckedChange={(checkedValue) => {
        onChange(checkedValue);
      }}
      {...properties}
    />
  );
}
