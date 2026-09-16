export { admitJsonSchema } from '@taucad/parameters/schema';
export type { JsonSchema } from '@taucad/parameters/schema';
export { configurationIconIds } from '#configuration/configuration-icons.generated.js';
export type { ConfigurationIconId } from '#configuration/configuration-icons.generated.js';
export {
  admitConfigurationManifest,
  defineConfiguration,
  validateConfiguration,
} from '#configuration/configuration.js';
export type {
  ConfigurationAdmissionDiagnostic,
  ConfigurationAdmissionResult,
  ConfigurationDefinition,
  ConfigurationIssue,
  ConfigurationManifestV1,
  ConfigurationNativeProjection,
  ConfigurationNativeProjectionDiagnostic,
  ConfigurationSource,
  RestrictedRjsfUiSchemaV1,
  RestrictedUiNodeV1,
  RestrictedUiWidgetV1,
  ValidateConfigurationInput,
  ValidateConfigurationResult,
} from '#configuration/configuration.js';
