const LEGACY_LINE_PRESET_MIGRATIONS: Record<string, string> = {
  betrayal_romance_revenge_class_shame: "billionaire_rich_poor_romance",
  betrayal_revenge_drama: "humiliation_revenge_justice",
  social_class_power_drama: "social_injustice_discrimination_drama",
  coming_of_age_identity_drama: "secret_identity_hidden_heiress",
  toxic_romance_emotional_damage: "cheating_ex_wedding_drama",
  quiet_literary_relationship_realism: "toxic_family_betrayal",
  psychological_thriller_drama: "secret_identity_hidden_heiress",
  romantasy_drama: "secret_identity_hidden_heiress",
};

export function normalizeLinePresetId(value: string) {
  return LEGACY_LINE_PRESET_MIGRATIONS[value] ?? value;
}

export function normalizeBranchScopedStylePresetId(value: string, preferredLinePreset?: string) {
  const match = /^(.+)__(.+)$/.exec(value);
  if (!match) {
    return value;
  }

  const [, branchId, lensId] = match;
  if (!branchId || !lensId) {
    return value;
  }

  const migratedBranchId = normalizeLinePresetId(branchId);
  if (migratedBranchId === branchId) {
    return value;
  }

  return `${preferredLinePreset ?? migratedBranchId}__${lensId}`;
}
