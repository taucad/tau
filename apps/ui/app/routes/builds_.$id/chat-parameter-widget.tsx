import type { WidgetProps } from '@rjsf/utils';
import { ChatParametersBoolean } from '~/routes/builds_.$id/chat-parameters-boolean.js';
import { ChatParametersNumber } from '~/routes/builds_.$id/chat-parameters-number.js';
import { ChatParametersString } from '~/routes/builds_.$id/chat-parameters-string.js';

export function ChatParameterWidget(props: WidgetProps): React.JSX.Element {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- RJSF is untyped
  const { value, onChange, name, schema } = props;

  const defaultValue = schema.default as string | number | boolean;
  const type = schema.type as 'boolean' | 'integer' | 'number' | 'string';

  switch (type) {
    case 'boolean': {
      const booleanValue = Boolean(value);

      return <ChatParametersBoolean value={booleanValue} onChange={onChange} />;
    }

    case 'number':
    case 'integer': {
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

    case 'string': {
      const stringValue = String(value);
      const defaultStringValue = String(defaultValue);

      return <ChatParametersString value={stringValue} defaultValue={defaultStringValue} onChange={onChange} />;
    }

    default: {
      const exhaustiveCheck: never = type;
      throw new Error(`Unsupported type: ${String(exhaustiveCheck)}`);
    }
  }
}
