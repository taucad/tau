import type { ResolveSkillRpcInput, ResolveSkillRpcResult } from '#schemas/rpc.schema.js';
import { rpcClientErrorCode } from '#schemas/rpc.schema.js';
import type { RpcSkillResolver } from '#rpc/rpc-dependencies.js';

/**
 * Resolves a skill through the environment-specific resolver.
 *
 * This handler intentionally does not read `contextPayload.skills`. That
 * metadata is prompt/autocomplete discovery only; activation must go through
 * the live resolver so virtual system skills and post-chat installs work.
 *
 * @public
 */
export async function handleResolveSkill(
  args: ResolveSkillRpcInput,
  resolver: RpcSkillResolver | undefined,
): Promise<ResolveSkillRpcResult> {
  if (!resolver) {
    return {
      success: false,
      errorCode: rpcClientErrorCode.unknown,
      message: 'Skill resolver is unavailable in this environment.',
    };
  }

  return resolver.resolveSkill(args.skillName);
}
