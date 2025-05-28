import { createActor } from 'xstate';
import { cameraCapabilityMachine } from '~/machines/camera-capability.js';
import { graphicsMachine } from '~/machines/graphics.js';
import { inspect } from '~/machines/inspector.js';
import { screenshotCapabilityMachine } from '~/machines/screenshot-capability.js';

export const graphicsActor = createActor(graphicsMachine, {
  inspect,
  input: {
    defaultCameraAngle: 60,
  },
});
graphicsActor.start();

export const screenshotCapabilityActor = createActor(screenshotCapabilityMachine, {
  inspect,
  input: {
    graphicsRef: graphicsActor,
  },
});
screenshotCapabilityActor.start();

export const cameraCapabilityActor = createActor(cameraCapabilityMachine, {
  inspect,
  input: {
    graphicsRef: graphicsActor,
  },
});
cameraCapabilityActor.start();
