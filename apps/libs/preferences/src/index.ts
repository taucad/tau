export { deviceRecordSchema, emptyDeviceRecord } from '#device-record.js';
export type { DeviceRecord } from '#device-record.js';
export { firstSignInMerge } from '#first-sign-in.js';
export type { SyncedSections } from '#first-sign-in.js';
export { mergeLeaves, overlayLeaves, resetLeaf } from '#leaf-merge.js';
export type { LeafPatch, ResetLeaf } from '#leaf-merge.js';
export {
  emptyOnboardingState,
  mergeOnboarding,
  onboardingDeltaOf,
  onboardingStateSchema,
  setupStatuses,
  tourEndings,
  tourStepIds,
} from '#onboarding-state.js';
export type { OnboardingDelta, OnboardingState, SetupStatus, TourEnding, TourStepId } from '#onboarding-state.js';
export { emptyPersonProfile, goalIds, languageIds, personProfileSchema, toolIds } from '#person-profile.js';
export type { GoalId, LanguageId, PersonProfile, ToolId } from '#person-profile.js';
export {
  deviceSection,
  onboardingSection,
  personProfileSection,
  prepareSectionWrite,
  readSection,
  storedSectionSchema,
  viewerPreferencesSection,
} from '#stored-section.js';
export type {
  SectionDefinition,
  SectionRead,
  SectionWrite,
  StoredSection,
  StoredSectionSchema,
} from '#stored-section.js';
export {
  effectiveGizmoStyle,
  effectivePreset,
  familiarProducts,
  suggestedGizmo,
  suggestedPreset,
  toolSuggestions,
} from '#suggestions.js';
export type { ToolSuggestion } from '#suggestions.js';
export { emptyViewerPreferences, gizmoStyleIds, mousePresetIds, viewerPreferencesSchema } from '#viewer-preferences.js';
export type { GizmoStyleId, MousePresetId, PersonalViewDefaults, ViewerPreferences } from '#viewer-preferences.js';
