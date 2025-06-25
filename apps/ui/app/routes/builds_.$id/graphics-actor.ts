import { createActorContext } from '@xstate/react';
import { createActor } from 'xstate';
import { cameraCapabilityMachine } from '~/machines/camera-capability.js';
import { fileExplorerMachine } from '~/machines/file-explorer.js';
import { graphicsMachine } from '~/machines/graphics.js';
import { inspect } from '~/machines/inspector.js';
import { screenshotCapabilityMachine } from '~/machines/screenshot-capability.js';

export const graphicsActor = createActor(graphicsMachine, {
  inspect,
  input: {
    defaultCameraFovAngle: 60,
  },
});
graphicsActor.start();

export const screenshotCapabilityActor = createActor(screenshotCapabilityMachine, {
  input: {
    graphicsRef: graphicsActor,
  },
});
screenshotCapabilityActor.start();

export const cameraCapabilityActor = createActor(cameraCapabilityMachine, {
  input: {
    graphicsRef: graphicsActor,
  },
});
cameraCapabilityActor.start();
// Create the actor context for use in React components

// eslint-disable-next-line @typescript-eslint/naming-convention -- this is a global context for the file explorer machine
export const FileExplorerContext = createActorContext(fileExplorerMachine);
