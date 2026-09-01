import { setup } from 'xstate';

type AuthSplashbackContext = {
  error: Error | undefined;
};

type AuthSplashbackEvent =
  | { type: 'typingComplete' }
  | { type: 'enterComplete' }
  | { type: 'userInteraction' }
  | { type: 'loadingReady' } // Scatter cloud + gear12 points + gear12 mesh all ready
  | { type: 'loadingMorphComplete' } // Scatter -> gear12 morph finished
  | { type: 'gear12MeshReady' } // Gear12 mesh crossfade finished (atoms -> matter handover)
  | { type: 'morphComplete' } // Point cloud morph animation finished (gear12 -> gear8)
  | { type: 'morph2Complete' } // Point cloud morph animation finished (gear8 -> assembly)
  | { type: 'geometriesReady' } // Both source and target geometries are ready for morphing
  | { type: 'gear8MeshReady' } // Gear8 mesh is loaded and ready for crossfade
  | { type: 'assemblyMeshReady' } // Assembly meshes are loaded and ready after crossfade
  | { type: 'unloadingMeshFadedOut' } // Assembly meshes -> per-gear point clouds crossfade finished
  | { type: 'unloadingMorphComplete' }; // Per-gear point clouds dispersed to scatter (matter -> abyss)

export const timing = {
  loadingPreparingFallback: 1500, // Fallback if cached data isn't yet present (first cycle JSCAD compute)
  gear12AnimateInDuration: 500,
  displayDuration: 3000,
  morphDuration: 1400, // Duration for point cloud morph animation
  crossfadeDuration: 400, // Duration for crossfade from point cloud to mesh
  gear8AnimateInDuration: 400,
  gear8DisplayDuration: 3000,
  assemblyAnimateInDuration: 400,
  assemblyDisplayDuration: 6000,
  resetDelay: 1000,
};

export const authSplashbackMachine = setup({
  types: {
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    context: {} as AuthSplashbackContext,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    events: {} as AuthSplashbackEvent,
  },
}).createMachine({
  id: 'authSplashback',
  initial: 'prompt1',
  context: { error: undefined },
  states: {
    prompt1: {
      initial: 'typing',
      states: {
        typing: {
          on: { typingComplete: 'enterKey' },
        },
        enterKey: {
          on: { enterComplete: '#authSplashback.loadingPreparing' },
        },
      },
    },
    // Atoms-to-matter loading pipeline (mirror of preparingMorph -> morphingToGear8 -> gear8WaitingForMesh).
    // Waits for cached data, runs scatter -> gear12 morph, then crossfades into the gear12 mesh.
    loadingPreparing: {
      on: {
        loadingReady: 'loadingMorphing',
      },
      after: {
        [timing.loadingPreparingFallback]: 'loadingMorphing',
      },
    },
    loadingMorphing: {
      on: {
        loadingMorphComplete: 'loadingCrossfading',
      },
      after: {
        [timing.morphDuration + 500]: 'loadingCrossfading',
      },
    },
    loadingCrossfading: {
      on: {
        gear12MeshReady: 'gear12',
      },
      after: {
        [timing.crossfadeDuration + 500]: 'gear12',
      },
    },
    gear12: {
      initial: 'animatingIn',
      states: {
        animatingIn: {
          after: {
            [timing.gear12AnimateInDuration]: 'displaying',
          },
        },
        displaying: {
          after: {
            [timing.displayDuration]: 'prompt2',
          },
          on: {
            // Re-enter to reset the timer when user interacts
            userInteraction: { target: 'displaying', reenter: true },
          },
        },
        prompt2: {
          initial: 'typing',
          states: {
            typing: {
              on: { typingComplete: 'enterKey' },
            },
            enterKey: {
              // Use morph transition instead of scale-based shrinking
              on: { enterComplete: '#authSplashback.preparingMorph' },
            },
          },
        },
      },
    },
    // Point cloud morph transition: gear12 -> gear8
    // Waits for both geometries to be ready, then runs morph animation
    preparingMorph: {
      on: {
        geometriesReady: 'morphingToGear8',
      },
    },
    morphingToGear8: {
      on: {
        morphComplete: 'gear8WaitingForMesh',
      },
      // Fallback timeout in case morph complete event is missed
      after: {
        [timing.morphDuration + 500]: 'gear8WaitingForMesh',
      },
    },
    // Intermediate state: morph complete, waiting for gear8 mesh to be ready
    // Point cloud stays visible until mesh is loaded and crossfade begins
    gear8WaitingForMesh: {
      on: {
        gear8MeshReady: 'gear8',
      },
      // Fallback timeout in case mesh ready event is missed
      after: {
        [timing.crossfadeDuration + 500]: 'gear8',
      },
    },
    gear8: {
      initial: 'animatingIn',
      states: {
        animatingIn: {
          after: {
            [timing.gear8AnimateInDuration]: 'displaying',
          },
        },
        displaying: {
          after: {
            [timing.gear8DisplayDuration]: 'prompt3',
          },
          on: {
            // Re-enter to reset the timer when user interacts
            userInteraction: { target: 'displaying', reenter: true },
          },
        },
        prompt3: {
          initial: 'typing',
          states: {
            typing: {
              on: { typingComplete: 'enterKey' },
            },
            enterKey: {
              // Use morph transition instead of scale-based shrinking
              on: { enterComplete: '#authSplashback.preparingMorph2' },
            },
          },
        },
      },
    },
    // Point cloud morph transition: gear8 -> assembly
    preparingMorph2: {
      on: {
        geometriesReady: 'morphingToAssembly',
      },
    },
    morphingToAssembly: {
      on: {
        morph2Complete: 'assemblyWaitingForMesh',
      },
      // Fallback timeout in case morph complete event is missed
      after: {
        [timing.morphDuration + 500]: 'assemblyWaitingForMesh',
      },
    },
    // Intermediate state: morph complete, waiting for assembly meshes to be ready
    // Split point cloud stays visible until meshes are loaded and crossfade begins
    assemblyWaitingForMesh: {
      on: {
        assemblyMeshReady: 'assembly',
      },
      // Fallback timeout in case mesh ready event is missed
      after: {
        [timing.crossfadeDuration + 500]: 'assembly',
      },
    },
    assembly: {
      initial: 'animatingIn',
      states: {
        animatingIn: {
          after: {
            [timing.assemblyAnimateInDuration]: 'displaying',
          },
        },
        displaying: {
          after: {
            [timing.assemblyDisplayDuration]: '#authSplashback.unloadingCrossfading',
          },
          on: {
            // Re-enter to reset the timer when user interacts
            userInteraction: { target: 'displaying', reenter: true },
          },
        },
      },
    },
    // Matter-to-abyss unloading pipeline (time-reverse of the loading pipeline).
    // Assembly meshes crossfade into per-gear point clouds, then those clouds morph
    // outward to the scatter cloud while their opacity fades to 0.
    unloadingCrossfading: {
      on: {
        unloadingMeshFadedOut: 'unloadingMorphing',
      },
      after: {
        [timing.crossfadeDuration + 500]: 'unloadingMorphing',
      },
    },
    unloadingMorphing: {
      on: {
        unloadingMorphComplete: 'resetting',
      },
      after: {
        [timing.morphDuration + 500]: 'resetting',
      },
    },
    resetting: {
      after: {
        [timing.resetDelay]: 'prompt1',
      },
    },
  },
});

export type AuthSplashbackActor = typeof authSplashbackMachine;
