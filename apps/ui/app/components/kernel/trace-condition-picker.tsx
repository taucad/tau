import { useCallback } from 'react';
import { ChevronDown, Clock, Copy, Tag, Circle, Plus, X, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu.js';
import { Button } from '#components/ui/button.js';
import { Input } from '#components/ui/input.js';
import { cn } from '#utils/ui.utils.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FilterField = 'latency' | 'name' | 'category' | 'selfTime';
export type FilterOperator = '>' | '>=' | '<' | '<=' | '=' | 'contains';
export type FilterCondition = {
  id: string;
  field: FilterField;
  operator: FilterOperator;
  value: string;
};

type FieldConfig = {
  label: string;
  icon: typeof Clock;
  operators: FilterOperator[];
  unit?: string;
  enumValues?: string[];
};

const fieldConfigs: Record<FilterField, FieldConfig> = {
  latency: { label: 'Latency', icon: Clock, operators: ['>', '>=', '<', '<='], unit: 'ms' },
  selfTime: { label: 'Self Time', icon: Clock, operators: ['>', '>=', '<', '<='], unit: 'ms' },
  name: { label: 'Name', icon: Tag, operators: ['contains', '='] },
  category: {
    label: 'Category',
    icon: Circle,
    operators: ['='],
    enumValues: ['framework', 'kernel', 'middleware', 'fs', 'deps'],
  },
};

let nextConditionId = 0;

export function createCondition(field: FilterField = 'latency'): FilterCondition {
  return {
    id: String(nextConditionId++),
    field,
    operator: fieldConfigs[field].operators[0]!,
    value: '',
  };
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function ConditionRow({
  condition,
  onChange,
  onRemove,
}: {
  readonly condition: FilterCondition;
  readonly onChange: (updated: FilterCondition) => void;
  readonly onRemove: () => void;
}): React.JSX.Element {
  const config = fieldConfigs[condition.field];

  const handleFieldChange = useCallback(
    (field: FilterField) => {
      const newConfig = fieldConfigs[field];
      onChange({
        ...condition,
        field,
        operator: newConfig.operators[0]!,
        value: '',
      });
    },
    [condition, onChange],
  );

  const handleOperatorChange = useCallback(
    (operator: FilterOperator) => {
      onChange({ ...condition, operator });
    },
    [condition, onChange],
  );

  const handleValueChange = useCallback(
    (value: string) => {
      onChange({ ...condition, value });
    },
    [condition, onChange],
  );

  return (
    <div className='flex items-center gap-1'>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type='button' variant='outline' size='xs' className='h-7 gap-1.5 px-2 font-normal'>
            <config.icon className='size-3 text-muted-foreground' />
            <span>{config.label}</span>
            <ChevronDown className='size-3 text-muted-foreground' />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='start' className='min-w-36'>
          {(Object.entries(fieldConfigs) as Array<[FilterField, FieldConfig]>).map(([key, fc]) => (
            <DropdownMenuItem
              key={key}
              onClick={() => {
                handleFieldChange(key);
              }}
            >
              <fc.icon className='size-3.5' />
              {fc.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type='button' variant='outline' size='xs' className='h-7 gap-1 px-2 font-normal'>
            <span>{condition.operator}</span>
            <ChevronDown className='size-3 text-muted-foreground' />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='start' className='min-w-16'>
          {config.operators.map((op) => (
            <DropdownMenuItem
              key={op}
              onClick={() => {
                handleOperatorChange(op);
              }}
            >
              {op}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {config.enumValues ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type='button' variant='outline' size='xs' className='h-7 min-w-20 gap-1 px-2 font-normal'>
              <span className='flex-1 text-left'>{condition.value || 'Select...'}</span>
              <ChevronDown className='size-3 text-muted-foreground' />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='start' className='min-w-28'>
            {config.enumValues.map((v) => (
              <DropdownMenuItem
                key={v}
                onClick={() => {
                  handleValueChange(v);
                }}
              >
                {v}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <div className='flex items-center gap-0'>
          <Input
            type={config.unit ? 'number' : 'text'}
            className={cn('h-7 border-border px-2 text-xs', config.unit ? 'w-16' : 'w-24')}
            placeholder={config.unit ? '0' : 'value'}
            value={condition.value}
            onChange={(event) => {
              handleValueChange(event.target.value);
            }}
          />
          {config.unit ? <span className='ml-1 text-xs text-muted-foreground'>{config.unit}</span> : undefined}
        </div>
      )}

      <Button type='button' variant='ghost' size='icon-sm' aria-label='Remove filter' onClick={onRemove}>
        <X className='size-3' />
      </Button>
    </div>
  );
}

export function TraceConditionPicker({
  conditions,
  onChange,
}: {
  readonly conditions: FilterCondition[];
  readonly onChange: (conditions: FilterCondition[]) => void;
}): React.JSX.Element {
  const handleConditionChange = useCallback(
    (index: number, updated: FilterCondition) => {
      const next = [...conditions];
      next[index] = updated;
      onChange(next);
    },
    [conditions, onChange],
  );

  const handleRemove = useCallback(
    (index: number) => {
      onChange(conditions.filter((_, i) => i !== index));
    },
    [conditions, onChange],
  );

  const handleAdd = useCallback(() => {
    onChange([...conditions, createCondition()]);
  }, [conditions, onChange]);

  const handleClear = useCallback(() => {
    onChange([]);
  }, [onChange]);

  const handleCopy = useCallback(() => {
    const text = conditions
      .map((c) => {
        const config = fieldConfigs[c.field];
        return `${config.label} ${c.operator} ${c.value}${config.unit ?? ''}`;
      })
      .join(' AND ');
    void navigator.clipboard.writeText(text);
  }, [conditions]);

  return (
    <div className='flex flex-col gap-2'>
      <div className='flex items-center justify-between'>
        <span className='text-sm font-medium'>Filters</span>
        <div className='flex items-center gap-1'>
          {conditions.length > 0 && (
            <>
              <Button variant='ghost' size='xs' aria-label='Copy filters' onClick={handleCopy}>
                <Copy className='size-3' />
              </Button>
              <Button variant='ghost' size='xs' aria-label='Clear filters' onClick={handleClear}>
                <Trash2 className='size-3' />
              </Button>
            </>
          )}
        </div>
      </div>

      {conditions.length > 0 && (
        <div className='flex flex-col gap-1.5'>
          <span className='text-xs text-muted-foreground'>Where</span>
          {conditions.map((condition, index) => (
            <ConditionRow
              key={condition.id}
              condition={condition}
              onChange={(updated) => {
                handleConditionChange(index, updated);
              }}
              onRemove={() => {
                handleRemove(index);
              }}
            />
          ))}
        </div>
      )}

      <Button variant='ghost' size='xs' className='w-fit' onClick={handleAdd}>
        <Plus className='size-3' />
        And
      </Button>
    </div>
  );
}
