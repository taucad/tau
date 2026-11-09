import * as React from 'react';
import { format } from 'date-fns';
import { Button } from '@taucad/ui/components/button';
import { Calendar } from '@taucad/ui/components/calendar';
import { Field, FieldLabel } from '@taucad/ui/components/field';
import { Popover, PopoverContent, PopoverTrigger } from '@taucad/ui/components/popover';

export function DatePickerSimple(): React.JSX.Element {
  const [date, setDate] = React.useState<Date>();

  return (
    <Field className='mx-auto w-44'>
      <FieldLabel htmlFor='date-picker-simple'>Date</FieldLabel>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant='outline' id='date-picker-simple' className='justify-start font-normal'>
            {date ? format(date, 'PPP') : <span>Pick a date</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className='w-auto p-0' align='start'>
          <Calendar mode='single' selected={date} defaultMonth={date} onSelect={setDate} />
        </PopoverContent>
      </Popover>
    </Field>
  );
}
