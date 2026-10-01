import type { Issue } from '@taucad/kinematics';
import type { KernelIssue } from '@taucad/runtime/types';
import { isJsonObject } from '#extensions/json.js';

/** Input for reading a model module's optional mechanism. @public */
export type ReadMechanismExportInput = Readonly<{
  module: unknown;
  parameters: Record<string, unknown>;
  kernelId: string;
  /** Source-map errors using the kernel's ordinary model error formatter. */
  formatError: (error: unknown) => KernelIssue;
}>;

/** Plain source metadata and warnings; component admission happens during delivery. @public */
export type ReadMechanismExportOutcome = Readonly<{ mechanism: unknown; issues: KernelIssue[] }>;

/** A canonical mechanism diagnostic and the kernel that produced it. @public */
export type ToMechanismKernelIssueInput = Readonly<{ issue: Issue; kernelId: string }>;

/**
 * Convert a mechanism diagnostic into a kernel warning while retaining its source pointer.
 *
 * @param input - Diagnostic and producer identity.
 * @returns A reference or annotation warning readable by the editor and Kinematics pane.
 * @public
 */
export const toMechanismKernelIssue = ({ issue, kernelId }: ToMechanismKernelIssueInput): KernelIssue => ({
  code: issue.code.startsWith('UNKNOWN_') ? 'INVALID_REFERENCE' : 'INVALID_ANNOTATION',
  severity: 'warning',
  type: 'kernel',
  message: `Mechanism${issue.path && ` ${issue.path}`}: ${issue.message} ${issue.recovery}`,
  details: { producer: { kernelId }, mechanism: issue },
});

const isMechanismFunction = (value: unknown): value is (parameters: Record<string, unknown>) => unknown =>
  typeof value === 'function';

const mechanismExportIssue = (message: string, recovery: string): Issue => ({
  code: 'INVALID_VALUE',
  path: '',
  message,
  recovery,
});

/**
 * Read an optional mechanism value or sync/async function with the parameters passed to main.
 * Snapshot JSON once so live and cached builds agree; errors warn without discarding geometry.
 *
 * @param input - Executed module, resolved parameters, producer and source-map error formatter.
 * @returns Owned JSON source metadata and warnings, admitted later against delivered components.
 * @public
 */
export async function readMechanismExport({
  module,
  parameters,
  kernelId,
  formatError,
}: ReadMechanismExportInput): Promise<ReadMechanismExportOutcome> {
  const exported = isJsonObject(module) ? module['mechanism'] : undefined;
  let value: unknown;
  try {
    value = await (isMechanismFunction(exported) ? exported(parameters) : exported);
  } catch (error) {
    const thrown = formatError(error);
    const { message, details } = toMechanismKernelIssue({
      kernelId,
      issue: mechanismExportIssue(
        `mechanism() threw "${thrown.message}".`,
        'Fix the error in mechanism(); the model renders without a mechanism until then.',
      ),
    });
    return { mechanism: undefined, issues: [{ ...thrown, severity: 'warning', message, details }] };
  }
  if (value === undefined) {
    return { mechanism: undefined, issues: [] };
  }
  try {
    // ponytail: plain JSON is the source contract; this also removes undefined before MessagePack writes nil.
    // oxlint-disable-next-line unicorn/prefer-structured-clone -- structuredClone retains undefined, unlike the persisted JSON contract.
    const mechanism: unknown = JSON.parse(JSON.stringify(value));
    return { mechanism, issues: [] };
  } catch {
    return {
      mechanism: undefined,
      issues: [
        toMechanismKernelIssue({
          kernelId,
          issue: mechanismExportIssue(
            'The mechanism cannot be written as JSON: it holds a BigInt or a reference cycle, or is a function or symbol.',
            'Return plain data: objects, arrays, strings, numbers and booleans.',
          ),
        }),
      ],
    };
  }
}
