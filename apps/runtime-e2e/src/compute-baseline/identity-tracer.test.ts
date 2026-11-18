/**
 * Audit F7: the W0 identity tracer must advance a receiver's identity when a call changes it.
 *
 * A builder that returns its receiver (`pen.lineTo(...)`) and a mutator that returns nothing
 * (`pen.push(...)`) both change the object. Before the fix the tracer kept the identity the object
 * was created with, so two runs that drew different paths gave every later call on the pen the same
 * identity and a ceiling counted it as reusable (a memo built on it returned wrong geometry).
 */
import { describe, expect, it } from 'vitest';
import { ceilings, createIdentityTracer } from '#compute-baseline/harness/identity-tracer.mts';

class Pen {
  public readonly points: number[] = [];

  public lineTo(x: number): this {
    this.points.push(x);
    return this;
  }

  public push(x: number): void {
    this.points.push(x);
  }

  public close(): { readonly points: readonly number[] } {
    return { points: [...this.points] };
  }
}

type Library = { readonly draw: () => Pen };

const library: Library = { draw: () => new Pen() };

/** Run one traced "model": draw, apply `edit` to the pen, then close it. */
const traceRun = (edit: (pen: Pen) => void) => {
  const tracer = createIdentityTracer();
  const traced = tracer.wrapLibrary(library);
  const pen = traced.draw();
  edit(pen);
  pen.close();
  return tracer.take();
};

const closeId = (trace: ReturnType<typeof traceRun>): string => {
  const entry = trace.find((candidate) => candidate.op === 'close');
  if (!entry) {
    expect.fail('the trace has no close call');
  }

  return entry.id;
};

describe('identity tracer effect model (F7)', () => {
  it('should give a call after a builder a different identity when the builder arguments differ', () => {
    const one = traceRun((pen) => pen.lineTo(1));
    const two = traceRun((pen) => pen.lineTo(2));

    expect(closeId(one)).not.toBe(closeId(two));
    expect(ceilings(one, two).perOp['close']?.sharedMs ?? 0).toBe(0);
  });

  it('should give a call after a void mutator a different identity when the mutator arguments differ', () => {
    const one = traceRun((pen) => {
      pen.push(1);
    });
    const two = traceRun((pen) => {
      pen.push(2);
    });

    expect(closeId(one)).not.toBe(closeId(two));
  });

  it('should keep identities equal for identical runs so ceilings still find sharing', () => {
    const one = traceRun((pen) => pen.lineTo(1).lineTo(2));
    const two = traceRun((pen) => pen.lineTo(1).lineTo(2));

    expect(closeId(one)).toBe(closeId(two));
    expect(ceilings(one, two).sharedCount).toBe(two.length);
  });
});
