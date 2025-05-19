import { createActor } from 'xstate';
import { cadMachine } from '~/machines/cad.js';

export const cadActor = createActor(cadMachine);
cadActor.start();
