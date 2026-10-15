import { compileParameterManifest, projectJsonSchemaToParameterDeclaration } from '@taucad/parameters';
import type { ParameterManifest } from '@taucad/parameters';
import type { JSONSchema7 } from '@taucad/json-schema';

type ResolvedSchema = { schema: JSONSchema7; defaults: Record<string, unknown> };

const safePathSegment = (value: string): string => value.replaceAll(/[^a-z0-9._-]/giu, '_');

export async function compileExportConfigurationManifest(
  provider: string,
  configuration: string,
  resolved: ResolvedSchema,
): Promise<Readonly<{ entryPath: string; manifest: ParameterManifest }>> {
  const bytes = new TextEncoder().encode(JSON.stringify(resolved));
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
  const scopeBytes = new TextEncoder().encode(`${provider}\u0000${configuration}`);
  const scopeHash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', scopeBytes))]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
  // SAFETY: Web Crypto produced the 32-byte lowercase SHA-256 payload above.
  const revision = `sha256:${hash}` as ParameterManifest['identity']['dependency'];
  const manifest = await compileParameterManifest({
    declaration: projectJsonSchemaToParameterDeclaration({
      schema: resolved.schema,
      defaults: resolved.defaults,
      schemaId: `urn:taucad:configuration:${encodeURIComponent(provider)}:${encodeURIComponent(configuration)}`,
      schemaName: 'ProviderConfiguration',
    }),
    scope: { kind: 'provider', provider, configuration },
    source: {
      id: `${provider}:${configuration}`,
      version: revision,
      revision,
      capability: 'json-structure',
    },
    dependency: revision,
    middleware: revision,
  });
  return {
    entryPath: `provider-configuration/${safePathSegment(provider)}-${scopeHash.slice(0, 8)}/${safePathSegment(configuration)}-${scopeHash.slice(8, 16)}`,
    manifest,
  };
}
