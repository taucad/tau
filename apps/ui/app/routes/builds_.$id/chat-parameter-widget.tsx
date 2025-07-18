import type { WidgetProps } from '@rjsf/utils';
import type { JSX } from 'react';
import { Input } from '~/components/ui/input.js';
import { ChatParametersBoolean } from '~/routes/builds_.$id/chat-parameters-boolean.js';
import { ChatParametersNumber } from '~/routes/builds_.$id/chat-parameters-number.js';
import { ChatParametersString } from '~/routes/builds_.$id/chat-parameters-string.js';

export function ChatParameterWidget(props: WidgetProps): JSX.Element {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- RJSF is untyped
  const { value, onChange, name, schema } = props;

  const defaultValue = schema.default as string | number | boolean;
  const type = schema.type as 'boolean' | 'integer' | 'number' | 'string';

  // If it's a boolean, render a switch
  if (type === 'boolean') {
    const booleanValue = Boolean(value);

    return <ChatParametersBoolean value={booleanValue} onChange={onChange} />;
  }

  // If it's a number, render an appropriate numeric input
  if (type === 'integer' || type === 'number') {
    const numericValue = Number.parseFloat(String(value));
    const defaultNumericValue = Number.parseFloat(String(defaultValue));
    const min = schema.minimum;
    const max = schema.maximum;
    const step = schema.multipleOf;

    return (
      <ChatParametersNumber
        value={numericValue}
        defaultValue={defaultNumericValue}
        name={name}
        min={min}
        max={max}
        step={step}
        onChange={onChange}
      />
    );
  }

  if (type === 'string') {
    const stringValue = String(value);
    const defaultStringValue = String(defaultValue);

    return <ChatParametersString value={stringValue} defaultValue={defaultStringValue} onChange={onChange} />;
  }

  // For other types, render a text input as fallback
  return (
    <Input
      autoComplete="off"
      type="text"
      value={String(value)}
      className="h-7 flex-1 bg-background p-1"
      onChange={(event) => {
        onChange(event.target.value);
      }}
    />
  );
}
