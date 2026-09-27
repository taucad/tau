import { describe, expectTypeOf, it } from 'vitest';
import * as kinematics from '@taucad/kinematics';
import type {
  AdmitMechanismOutcome,
  Animation,
  DegreeOfFreedom,
  EvaluatePoseInput,
  FindLinkByComponentInput,
  Link,
  LinkSource,
  Mechanism,
  MechanismSource,
  PoseOutcome,
  ResolveMechanismComponentsInput,
  ResolveMechanismComponentsOutcome,
  SampleAnimationInput,
  SolvePoseInput,
  SolvePoseOutcome,
  TransformMechanismInput,
  TransformMechanismOutcome,
} from '@taucad/kinematics';

/** Plain JSON data: no functions, class instances, typed arrays or renderer handles. */
type Json = string | number | boolean | readonly Json[] | { readonly [key: string]: Json | undefined };

describe('@taucad/kinematics public surface', () => {
  it('should export exactly the documented runtime values', () => {
    expectTypeOf<keyof typeof kinematics>().toEqualTypeOf<
      | 'admitMechanism'
      | 'evaluatePose'
      | 'findLinkByComponent'
      | 'listDegreesOfFreedom'
      | 'mechanismSchemaVersion'
      | 'resolveMechanismComponents'
      | 'sampleAnimation'
      | 'solvePose'
      | 'transformMechanism'
    >();
  });

  it('should keep every operation a pure function of package-owned data types', () => {
    expectTypeOf(kinematics.admitMechanism).toEqualTypeOf<(input: unknown) => AdmitMechanismOutcome>();
    expectTypeOf(kinematics.listDegreesOfFreedom).toEqualTypeOf<(mechanism: Mechanism) => readonly DegreeOfFreedom[]>();
    expectTypeOf(kinematics.evaluatePose).toEqualTypeOf<(input: EvaluatePoseInput) => PoseOutcome>();
    expectTypeOf(kinematics.solvePose).toEqualTypeOf<(input: SolvePoseInput) => SolvePoseOutcome>();
    expectTypeOf(kinematics.sampleAnimation).toEqualTypeOf<
      (input: SampleAnimationInput) => Readonly<Record<string, number>>
    >();
    expectTypeOf(kinematics.transformMechanism).toEqualTypeOf<
      (input: TransformMechanismInput) => TransformMechanismOutcome
    >();
    expectTypeOf(kinematics.resolveMechanismComponents).toEqualTypeOf<
      (input: ResolveMechanismComponentsInput) => ResolveMechanismComponentsOutcome
    >();
    expectTypeOf(kinematics.findLinkByComponent).toEqualTypeOf<
      (input: FindLinkByComponentInput) => string | undefined
    >();
  });

  it('should sample an admitted animation without an unused mechanism input', () => {
    expectTypeOf<SampleAnimationInput>().not.toHaveProperty('mechanism');
    expectTypeOf<SampleAnimationInput>().toEqualTypeOf<Readonly<{ animation: Animation; time: number }>>();
  });

  it('should keep authored shape names and resolved component ids in distinct types', () => {
    expectTypeOf<MechanismSource['links'][string]>().toEqualTypeOf<LinkSource>();
    expectTypeOf<Mechanism['links'][string]>().toEqualTypeOf<Link>();
    expectTypeOf<MechanismSource>().not.toExtend<Mechanism>();
    expectTypeOf<MechanismSource>().toExtend<Json>();
  });

  it('should carry only JSON data in mechanisms and outcomes, never three.js, React or DOM objects', () => {
    expectTypeOf<Mechanism>().toExtend<Json>();
    expectTypeOf<AdmitMechanismOutcome>().toExtend<Json>();
    expectTypeOf<PoseOutcome>().toExtend<Json>();
    expectTypeOf<SolvePoseOutcome>().toExtend<Json>();
    expectTypeOf<readonly DegreeOfFreedom[]>().toExtend<Json>();
  });

  it('should reject renderer objects where the contract expects data', () => {
    const element = { tagName: 'DIV', getBoundingClientRect: () => ({ x: 0 }) };

    // @ts-expect-error a DOM-like object with methods is not mechanism data
    expectTypeOf(element).toExtend<Json>();
    // @ts-expect-error the package does not export three.js types
    expectTypeOf<kinematics.Matrix4>().toBeObject();
  });
});
