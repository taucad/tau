import { expectTypeOf } from 'vitest';
import type { ModelFamily } from '@taucad/chat';
import type { IconId } from '@taucad/ui-kit/icons/svg-icon';

// Every model family resolves to a renderable icon: a family that lands without a matching sprite or alias fails
// here instead of rendering an empty `<use href="...#newid">`.
expectTypeOf<ModelFamily>().toExtend<IconId>();
