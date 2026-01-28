// src/engine/rules/effectiveWeaponRules.js

export function getEffectiveWeaponRules(ctx) {
  const baseRules = Array.isArray(ctx?.weaponRules)
    ? [...ctx.weaponRules]
    : [];

  const vantage = ctx?.modifiers?.vantageState;
  const accurateValue =
    vantage?.mode === "4in"
      ? 2
      : vantage?.mode === "2in"
        ? 1
        : null;

  // Remove any previously injected Accurate-from-Vantage rule
  const filteredBase = baseRules.filter(
    (rule) => !(rule?.id === "accurate" && rule?.source === "vantage"),
  );

  if (accurateValue == null) {
    return filteredBase;
  }

  return [
    {
      id: "accurate",
      value: accurateValue,
      timing: "PRE_ROLL",
      source: "vantage",
      label: `Accurate ${accurateValue} (Vantage)`,
      testId: `wr-chip-accurate-vantage-${accurateValue}`,
    },
    ...filteredBase,
  ];
}
