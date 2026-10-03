import { floorArc, heroDial } from '#www/hero-view.js';
import { createScene, loadAssembly } from '#www/scene.js';
import { readStoryProgress } from '#www/story-progress.js';

/** @type {Promise<void> | undefined} */
let started;

/**
 * Start the shared live scene once. The hero and the story borrow the same canvas;
 * frames are drawn only when the view changes, never while idle, hidden or offscreen.
 * @internal
 * @param stages - Server-rendered stages and chapters; each keeps its static art as fallback.
 * @type {(stages: {heroStage: Element | null, storyStage: Element | null, chapters: Element[]}) => Promise<void>}
 */
export const start = async (stages) => {
  started ??= run(stages);
  return started;
};

/** @type {(stages: {heroStage: Element | null, storyStage: Element | null, chapters: Element[]}) => Promise<void>} */
const run = async ({ heroStage, storyStage, chapters }) => {
  const hero = heroStage instanceof HTMLElement ? heroStage : undefined;
  const story = storyStage instanceof HTMLElement ? storyStage : undefined;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const controller = new AbortController();
  const { signal } = controller;
  // Leaving the page while geometry downloads must never allocate a renderer.
  addEventListener(
    'pagehide',
    () => {
      controller.abort();
    },
    { once: true },
  );
  for (const stage of [hero, story]) {
    stage?.setAttribute('aria-busy', 'true');
  }
  const assembly = await loadAssembly(signal);
  if (signal.aborted || reduced.matches) {
    for (const stage of [hero, story]) {
      stage?.removeAttribute('aria-busy');
    }
    return;
  }
  const scene = createScene(assembly);
  const hosts = new Map(
    [hero, story].flatMap((stage) => {
      const host = stage?.querySelector('[data-canvas-host]');
      return stage && host instanceof HTMLElement ? [[stage, host]] : [];
    }),
  );
  /** @type {HTMLElement | undefined} */
  let current;
  let frame = 0;
  let disposed = false;
  let paused = false;
  let angle = 0;
  /** @type {Set<HTMLElement>} */
  const visible = new Set();
  const dispose = () => {
    if (disposed) {
      return;
    }
    disposed = true;
    cancelAnimationFrame(frame);
    controller.abort();
    visibility.disconnect();
    scene.dispose();
    for (const stage of hosts.keys()) {
      stage.classList.remove('is-live');
      stage.removeAttribute('aria-busy');
    }
  };
  const draw = () => {
    frame = 0;
    if (disposed || document.hidden || !current) {
      return;
    }
    current.dataset['frames'] = String(Number(current.dataset['frames'] ?? 0) + 1);
    if (current === hero) {
      scene.draw({ kind: 'hero', sunAngle: (angle * Math.PI) / 180, narrow: innerWidth <= 760 });
    } else {
      scene.draw({ kind: 'story', progress: readStoryProgress(chapters), narrow: innerWidth <= 760 });
    }
  };
  const request = () => {
    if (!frame && !disposed && current && !document.hidden) {
      frame = requestAnimationFrame(draw);
    }
  };
  // The canvas lives in whichever stage is on screen; the story wins when both peek in.
  const place = () => {
    const next = story && visible.has(story) && !paused ? story : hero && visible.has(hero) ? hero : undefined;
    if (next === current) {
      return;
    }
    current?.classList.remove('is-live');
    current = next;
    if (!current) {
      cancelAnimationFrame(frame);
      frame = 0;
      return;
    }
    const host = hosts.get(current);
    if (host) {
      scene.attach(host);
    }
    // Draw before revealing so the poster never gives way to an empty canvas.
    draw();
    current.classList.add('is-live');
  };
  const visibility = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.target instanceof HTMLElement) {
          if (entry.isIntersecting) {
            visible.add(entry.target);
          } else {
            visible.delete(entry.target);
          }
        }
      }
      place();
    },
    { threshold: 0 },
  );
  for (const stage of hosts.keys()) {
    visibility.observe(stage);
  }
  await scene.compile();
  for (const stage of hosts.keys()) {
    stage.removeAttribute('aria-busy');
  }
  addEventListener('scroll', request, { passive: true, signal });
  addEventListener('resize', request, { passive: true, signal });
  addEventListener('pagehide', dispose, { once: true, signal });
  reduced.addEventListener(
    'change',
    () => {
      if (reduced.matches) {
        dispose();
      }
    },
    { signal },
  );
  document.addEventListener('visibilitychange', request, { signal });
  scene.canvas.addEventListener(
    'webglcontextlost',
    (event) => {
      event.preventDefault();
      dispose();
      for (const stage of hosts.keys()) {
        stage.dataset['fallback'] = 'true';
      }
      dispatchEvent(new Event('www:still'));
    },
    { signal },
  );

  if (hero) {
    const input = hero.querySelector('#turn-input');
    const control = hero.querySelector('[data-turn]');
    const note = hero.querySelector('[data-note]');
    const inValue = hero.querySelector('[data-in]');
    const outValue = hero.querySelector('[data-out]');
    const dial = hero.querySelector('[data-dial-input]');
    /** @type {(degrees: number) => void} */
    const turn = (degrees) => {
      angle = Math.max(0, Math.min(1440, degrees));
      const output = angle / 4;
      if (inValue) {
        inValue.textContent = `${Math.round(angle)}°`;
      }
      if (outValue) {
        outValue.textContent = `${output.toFixed(1)}°`;
      }
      if (input instanceof HTMLInputElement) {
        input.value = String(Math.round(angle));
        input.setAttribute('aria-valuetext', `Input ${Math.round(angle)} degrees, output ${output.toFixed(1)} degrees`);
      }
      // The input arc runs on the floor dial, sweeping the way the sun turns.
      dial?.setAttribute('d', floorArc(heroDial.radius, 0, angle % 360 || (angle ? 360 : 0)));
      request();
    };
    if (control instanceof HTMLElement) {
      control.hidden = false;
    }
    if (note instanceof HTMLElement) {
      note.hidden = true;
    }
    input?.addEventListener(
      'input',
      () => {
        if (input instanceof HTMLInputElement) {
          turn(Number(input.value));
        }
      },
      { signal },
    );
    // Drag anywhere on the model to turn the sun; the range input is the non-drag path (WCAG 2.5.7).
    /** @type {number | undefined} */
    let dragX;
    hero.addEventListener(
      'pointerdown',
      (event) => {
        if (!(event.target instanceof Element) || event.target.closest('input, a, button')) {
          return;
        }
        dragX = event.clientX;
        hero.setPointerCapture(event.pointerId);
        hero.classList.add('is-dragging');
      },
      { signal },
    );
    hero.addEventListener(
      'pointermove',
      (event) => {
        if (dragX === undefined) {
          return;
        }
        turn(angle + (event.clientX - dragX) * 0.9);
        dragX = event.clientX;
      },
      { signal },
    );
    const release = () => {
      dragX = undefined;
      hero.classList.remove('is-dragging');
    };
    hero.addEventListener('pointerup', release, { signal });
    hero.addEventListener('pointercancel', release, { signal });
    // One demonstration turn teaches the interaction: the sun turns 90°, the carrier 22.5°.
    // Reduced motion never reaches this point; a later switch disposes the scene and stops it.
    const begin = performance.now() + 250;
    const demo = (/** @type {number} */ now) => {
      if (disposed || dragX !== undefined || angle > 90) {
        return;
      }
      const t = Math.min(1, Math.max(0, (now - begin) / 1100));
      turn(90 * (t * t * (3 - 2 * t)));
      if (t < 1) {
        requestAnimationFrame(demo);
      }
    };
    requestAnimationFrame(demo);
  }

  const toggle = story?.querySelector('[data-story-toggle]');
  if (toggle instanceof HTMLButtonElement) {
    toggle.hidden = false;
    toggle.addEventListener(
      'click',
      () => {
        paused = !paused;
        toggle.setAttribute('aria-pressed', String(paused));
        toggle.textContent = paused ? 'Show live 3D' : 'Show still frames';
        if (paused && story) {
          story.classList.remove('is-live');
          current = undefined;
          dispatchEvent(new Event('www:still'));
        }
        place();
      },
      { signal },
    );
  }
};
