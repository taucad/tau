import type { ArtifactGraph } from '@taucad/kcl-wasm-lib/bindings/Artifact';
import type { CompilationIssue } from '@taucad/kcl-wasm-lib/bindings/CompilationIssue';
import type { DefaultPlanes } from '@taucad/kcl-wasm-lib/bindings/DefaultPlanes';
import type { KclValueView } from '@taucad/kcl-wasm-lib/bindings/KclValueView';
import type { ModulePath } from '@taucad/kcl-wasm-lib/bindings/ModulePath';
import type { OperationsByModule } from '@taucad/kcl-wasm-lib/bindings/OperationsByModule';

/**
 * Outcome of executing a KCL program against the Zoo engine, containing the full modeling state.
 *
 * @public
 */
export type KclExecutionResult = {
  variables: Partial<Record<string, KclValueView>>;
  operations: OperationsByModule;
  artifactGraph: ArtifactGraph;
  errors: CompilationIssue[];
  warnings: CompilationIssue[];
  filenames: Record<number, ModulePath | undefined>;
  defaultPlanes: DefaultPlanes | undefined;
};
