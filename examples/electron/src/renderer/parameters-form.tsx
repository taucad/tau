/** Single row consumed by {@link ParametersForm}; mapped from runtime `parametersResolved`. */
export type ParametersFormRow = {
  readonly name: string;
  readonly defaultValue: number | string;
};

export type ParametersFormProperties = {
  readonly params: readonly ParametersFormRow[];
  readonly override?: { name: string; value: number };
  readonly onChange: (name: string, value: number) => void;
};

export function ParametersForm({ params, override, onChange }: ParametersFormProperties): React.ReactElement {
  if (params.length === 0) {
    return (
      <p data-testid='parameters-empty' style={emptyStyles}>
        Parameters appear after the first render.
      </p>
    );
  }

  return (
    <ul data-testid='parameters-list' style={listStyles}>
      {params.map((parameter) => {
        const numericDefault = typeof parameter.defaultValue === 'number' ? parameter.defaultValue : 0;
        const value = override?.name === parameter.name ? override.value : numericDefault;
        return (
          <li key={parameter.name} style={rowStyles}>
            <label
              htmlFor={`param-${parameter.name}`}
              data-testid={`param-label-${parameter.name}`}
              style={labelStyles}
            >
              {parameter.name}
            </label>
            <input
              id={`param-${parameter.name}`}
              data-testid={`param-input-${parameter.name}`}
              type='number'
              value={value}
              onChange={(event) => {
                onChange(parameter.name, Number(event.target.value));
              }}
              style={inputStyles}
            />
          </li>
        );
      })}
    </ul>
  );
}

const emptyStyles: React.CSSProperties = {
  fontSize: '0.85rem',
  // oxlint-disable-next-line tau-lint/no-hardcoded-color -- standalone Electron example: no design-token system, inline-only React style sheet
  color: '#7e8b9b',
  margin: 0,
  padding: '0.85rem',
};

const listStyles: React.CSSProperties = {
  display: 'grid',
  gap: '0.75rem',
  listStyle: 'none',
  margin: 0,
  padding: '0.85rem',
};

const rowStyles: React.CSSProperties = {
  display: 'grid',
  gap: '0.45rem',
};

const labelStyles: React.CSSProperties = {
  // oxlint-disable-next-line tau-lint/no-hardcoded-color -- standalone Electron example: no design-token system, inline-only React style sheet
  color: '#e2e8f0',
  fontSize: '0.85rem',
  fontWeight: 700,
};

const inputStyles: React.CSSProperties = {
  // oxlint-disable-next-line tau-lint/no-hardcoded-color -- standalone Electron example: no design-token system, inline-only React style sheet
  background: 'rgba(2, 6, 12, 0.52)',
  // oxlint-disable-next-line tau-lint/no-hardcoded-color -- standalone Electron example: no design-token system, inline-only React style sheet
  border: '1px solid rgba(148, 163, 184, 0.2)',
  borderRadius: 8,
  // oxlint-disable-next-line tau-lint/no-hardcoded-color -- standalone Electron example: no design-token system, inline-only React style sheet
  color: '#f8fafc',
  fontSize: '0.85rem',
  height: 38,
  minWidth: 0,
  outline: 0,
  padding: '0 0.7rem',
};
