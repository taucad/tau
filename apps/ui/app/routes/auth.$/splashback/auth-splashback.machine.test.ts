import { describe, it, expect, vi, afterEach } from 'vitest';
import { createActor } from 'xstate';
import { authSplashbackMachine, timing } from '#routes/auth.$/splashback/auth-splashback.machine.js';

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

function createTestActor() {
  return createActor(authSplashbackMachine);
}

type TestActor = ReturnType<typeof createTestActor>;

function advanceThroughLoading(actor: TestActor) {
  actor.send({ type: 'typingComplete' });
  actor.send({ type: 'enterComplete' });
  actor.send({ type: 'loadingReady' });
  actor.send({ type: 'loadingMorphComplete' });
  actor.send({ type: 'gear12MeshReady' });
}

function advanceToGear8(actor: TestActor) {
  advanceThroughLoading(actor);
  vi.advanceTimersByTime(timing.gear12AnimateInDuration + timing.displayDuration);
  actor.send({ type: 'typingComplete' });
  actor.send({ type: 'enterComplete' });
  actor.send({ type: 'geometriesReady' });
  actor.send({ type: 'morphComplete' });
  actor.send({ type: 'gear8MeshReady' });
}

function advanceToPrompt3(actor: TestActor) {
  advanceToGear8(actor);
  vi.advanceTimersByTime(timing.gear8AnimateInDuration + timing.gear8DisplayDuration);
}

function advanceToAssembly(actor: TestActor) {
  advanceToPrompt3(actor);
  actor.send({ type: 'typingComplete' });
  actor.send({ type: 'enterComplete' });
  actor.send({ type: 'geometriesReady' });
  actor.send({ type: 'morph2Complete' });
  actor.send({ type: 'assemblyMeshReady' });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('authSplashbackMachine', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('initial state', () => {
    it('should start in prompt1.typing state', () => {
      const actor = createTestActor();
      actor.start();
      expect(actor.getSnapshot().value).toEqual({ prompt1: 'typing' });
      expect(actor.getSnapshot().context.error).toBeUndefined();
      actor.stop();
    });
  });

  describe('prompt1 flow', () => {
    it('should transition to prompt1.enterKey on typingComplete', () => {
      const actor = createTestActor();
      actor.start();
      actor.send({ type: 'typingComplete' });
      expect(actor.getSnapshot().value).toEqual({ prompt1: 'enterKey' });
      actor.stop();
    });

    it('should transition to loadingPreparing on enterComplete', () => {
      const actor = createTestActor();
      actor.start();
      actor.send({ type: 'typingComplete' });
      actor.send({ type: 'enterComplete' });
      expect(actor.getSnapshot().value).toBe('loadingPreparing');
      actor.stop();
    });
  });

  describe('loading pipeline (atoms-to-matter)', () => {
    it('should advance loadingPreparing -> loadingMorphing on loadingReady', () => {
      const actor = createTestActor();
      actor.start();
      actor.send({ type: 'typingComplete' });
      actor.send({ type: 'enterComplete' });
      expect(actor.getSnapshot().value).toBe('loadingPreparing');

      actor.send({ type: 'loadingReady' });
      expect(actor.getSnapshot().value).toBe('loadingMorphing');
      actor.stop();
    });

    it('should fall back from loadingPreparing after loadingPreparingFallback timeout', () => {
      vi.useFakeTimers();
      try {
        const actor = createTestActor();
        actor.start();
        actor.send({ type: 'typingComplete' });
        actor.send({ type: 'enterComplete' });
        expect(actor.getSnapshot().value).toBe('loadingPreparing');

        vi.advanceTimersByTime(timing.loadingPreparingFallback);
        expect(actor.getSnapshot().value).toBe('loadingMorphing');
        actor.stop();
      } finally {
        vi.useRealTimers();
      }
    });

    it('should advance loadingMorphing -> loadingCrossfading on loadingMorphComplete', () => {
      const actor = createTestActor();
      actor.start();
      actor.send({ type: 'typingComplete' });
      actor.send({ type: 'enterComplete' });
      actor.send({ type: 'loadingReady' });
      actor.send({ type: 'loadingMorphComplete' });
      expect(actor.getSnapshot().value).toBe('loadingCrossfading');
      actor.stop();
    });

    it('should advance loadingCrossfading -> gear12 on gear12MeshReady', () => {
      const actor = createTestActor();
      actor.start();
      advanceThroughLoading(actor);
      expect(actor.getSnapshot().value).toEqual({ gear12: 'animatingIn' });
      actor.stop();
    });

    it('should fall back from loadingMorphing after morphDuration timeout', () => {
      vi.useFakeTimers();
      try {
        const actor = createTestActor();
        actor.start();
        actor.send({ type: 'typingComplete' });
        actor.send({ type: 'enterComplete' });
        actor.send({ type: 'loadingReady' });
        expect(actor.getSnapshot().value).toBe('loadingMorphing');

        vi.advanceTimersByTime(timing.morphDuration + 500);
        expect(actor.getSnapshot().value).toBe('loadingCrossfading');
        actor.stop();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('gear12 flow', () => {
    it('should progress through animatingIn → displaying → prompt2.typing', () => {
      vi.useFakeTimers();
      try {
        const actor = createTestActor();
        actor.start();
        advanceThroughLoading(actor);
        expect(actor.getSnapshot().value).toEqual({ gear12: 'animatingIn' });

        vi.advanceTimersByTime(timing.gear12AnimateInDuration);
        expect(actor.getSnapshot().value).toEqual({ gear12: 'displaying' });

        vi.advanceTimersByTime(timing.displayDuration);
        expect(actor.getSnapshot().value).toEqual({ gear12: { prompt2: 'typing' } });
        actor.stop();
      } finally {
        vi.useRealTimers();
      }
    });

    it('should reset display timer on userInteraction', () => {
      vi.useFakeTimers();
      try {
        const actor = createTestActor();
        actor.start();
        advanceThroughLoading(actor);
        vi.advanceTimersByTime(timing.gear12AnimateInDuration);
        expect(actor.getSnapshot().value).toEqual({ gear12: 'displaying' });

        vi.advanceTimersByTime(timing.displayDuration - 100);
        actor.send({ type: 'userInteraction' });

        vi.advanceTimersByTime(100);
        expect(actor.getSnapshot().value).toEqual({ gear12: 'displaying' });

        vi.advanceTimersByTime(timing.displayDuration);
        expect(actor.getSnapshot().value).toEqual({ gear12: { prompt2: 'typing' } });
        actor.stop();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('morph to gear8', () => {
    it('should transition through preparingMorph → morphingToGear8 → gear8', () => {
      vi.useFakeTimers();
      try {
        const actor = createTestActor();
        actor.start();
        advanceThroughLoading(actor);
        vi.advanceTimersByTime(timing.gear12AnimateInDuration + timing.displayDuration);
        expect(actor.getSnapshot().value).toEqual({ gear12: { prompt2: 'typing' } });
        actor.send({ type: 'typingComplete' });
        actor.send({ type: 'enterComplete' });

        expect(actor.getSnapshot().value).toBe('preparingMorph');

        actor.send({ type: 'geometriesReady' });
        expect(actor.getSnapshot().value).toBe('morphingToGear8');

        actor.send({ type: 'morphComplete' });
        expect(actor.getSnapshot().value).toBe('gear8WaitingForMesh');

        actor.send({ type: 'gear8MeshReady' });
        expect(actor.getSnapshot().value).toEqual({ gear8: 'animatingIn' });
        actor.stop();
      } finally {
        vi.useRealTimers();
      }
    });

    it('should fallback from morphingToGear8 after timeout', () => {
      vi.useFakeTimers();
      try {
        const actor = createTestActor();
        actor.start();
        advanceThroughLoading(actor);
        vi.advanceTimersByTime(timing.gear12AnimateInDuration + timing.displayDuration);
        actor.send({ type: 'typingComplete' });
        actor.send({ type: 'enterComplete' });
        actor.send({ type: 'geometriesReady' });
        expect(actor.getSnapshot().value).toBe('morphingToGear8');

        vi.advanceTimersByTime(timing.morphDuration + 500);
        expect(actor.getSnapshot().value).toBe('gear8WaitingForMesh');
        actor.stop();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('gear8 flow', () => {
    it('should progress through animatingIn → displaying → prompt3.typing', () => {
      vi.useFakeTimers();
      try {
        const actor = createTestActor();
        actor.start();
        advanceToGear8(actor);

        expect(actor.getSnapshot().value).toEqual({ gear8: 'animatingIn' });
        vi.advanceTimersByTime(timing.gear8AnimateInDuration);
        expect(actor.getSnapshot().value).toEqual({ gear8: 'displaying' });
        vi.advanceTimersByTime(timing.gear8DisplayDuration);
        expect(actor.getSnapshot().value).toEqual({ gear8: { prompt3: 'typing' } });
        actor.stop();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('morph to assembly', () => {
    it('should transition through preparingMorph2 → morphingToAssembly → assembly', () => {
      vi.useFakeTimers();
      try {
        const actor = createTestActor();
        actor.start();
        advanceToPrompt3(actor);

        expect(actor.getSnapshot().value).toEqual({ gear8: { prompt3: 'typing' } });
        actor.send({ type: 'typingComplete' });
        actor.send({ type: 'enterComplete' });

        expect(actor.getSnapshot().value).toBe('preparingMorph2');
        actor.send({ type: 'geometriesReady' });
        expect(actor.getSnapshot().value).toBe('morphingToAssembly');

        actor.send({ type: 'morph2Complete' });
        expect(actor.getSnapshot().value).toBe('assemblyWaitingForMesh');

        actor.send({ type: 'assemblyMeshReady' });
        expect(actor.getSnapshot().value).toEqual({ assembly: 'animatingIn' });
        actor.stop();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('unloading pipeline (matter-to-abyss)', () => {
    it('should transition assembly -> unloadingCrossfading after display timer', () => {
      vi.useFakeTimers();
      try {
        const actor = createTestActor();
        actor.start();
        advanceToAssembly(actor);

        expect(actor.getSnapshot().value).toEqual({ assembly: 'animatingIn' });
        vi.advanceTimersByTime(timing.assemblyAnimateInDuration);
        expect(actor.getSnapshot().value).toEqual({ assembly: 'displaying' });

        vi.advanceTimersByTime(timing.assemblyDisplayDuration);
        expect(actor.getSnapshot().value).toBe('unloadingCrossfading');
        actor.stop();
      } finally {
        vi.useRealTimers();
      }
    });

    it('should advance unloadingCrossfading -> unloadingMorphing on unloadingMeshFadedOut', () => {
      vi.useFakeTimers();
      try {
        const actor = createTestActor();
        actor.start();
        advanceToAssembly(actor);
        vi.advanceTimersByTime(timing.assemblyAnimateInDuration + timing.assemblyDisplayDuration);
        expect(actor.getSnapshot().value).toBe('unloadingCrossfading');

        actor.send({ type: 'unloadingMeshFadedOut' });
        expect(actor.getSnapshot().value).toBe('unloadingMorphing');
        actor.stop();
      } finally {
        vi.useRealTimers();
      }
    });

    it('should advance unloadingMorphing -> resetting -> prompt1 on completion', () => {
      vi.useFakeTimers();
      try {
        const actor = createTestActor();
        actor.start();
        advanceToAssembly(actor);
        vi.advanceTimersByTime(timing.assemblyAnimateInDuration + timing.assemblyDisplayDuration);
        actor.send({ type: 'unloadingMeshFadedOut' });
        actor.send({ type: 'unloadingMorphComplete' });

        expect(actor.getSnapshot().value).toBe('resetting');
        vi.advanceTimersByTime(timing.resetDelay);
        expect(actor.getSnapshot().value).toEqual({ prompt1: 'typing' });
        actor.stop();
      } finally {
        vi.useRealTimers();
      }
    });

    it('should fall back from unloadingCrossfading after crossfadeDuration timeout', () => {
      vi.useFakeTimers();
      try {
        const actor = createTestActor();
        actor.start();
        advanceToAssembly(actor);
        vi.advanceTimersByTime(timing.assemblyAnimateInDuration + timing.assemblyDisplayDuration);
        expect(actor.getSnapshot().value).toBe('unloadingCrossfading');

        vi.advanceTimersByTime(timing.crossfadeDuration + 500);
        expect(actor.getSnapshot().value).toBe('unloadingMorphing');
        actor.stop();
      } finally {
        vi.useRealTimers();
      }
    });

    it('should fall back from unloadingMorphing after morphDuration timeout', () => {
      vi.useFakeTimers();
      try {
        const actor = createTestActor();
        actor.start();
        advanceToAssembly(actor);
        vi.advanceTimersByTime(timing.assemblyAnimateInDuration + timing.assemblyDisplayDuration);
        actor.send({ type: 'unloadingMeshFadedOut' });
        expect(actor.getSnapshot().value).toBe('unloadingMorphing');

        vi.advanceTimersByTime(timing.morphDuration + 500);
        expect(actor.getSnapshot().value).toBe('resetting');
        actor.stop();
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
