// src/engine/rules/effectiveWeaponRules.js

export function getEffectiveWeaponRules(ctx) {
  if (!ctx) return [];
  const baseRules = Array.isArray(ctx?.weaponRules)
    ? [...ctx.weaponRules]
    : [];
  const role = String(ctx?.inputs?.role || "").toLowerCase();

  const vantage = ctx?.modifiers?.vantageState;
  const accurateModeValue =
    vantage?.mode === "4in"
      ? 2
      : vantage?.mode === "2in"
        ? 1
        : null;
  const accurateValue = Number(vantage?.accurateValue);
  const resolvedAccurateValue = Number.isFinite(accurateValue)
    ? accurateValue
    : accurateModeValue;

  // Remove any previously injected Accurate-from-Vantage rule
  const filteredBase = baseRules.filter(
    (rule) => !(rule?.id === "accurate" && rule?.source === "vantage"),
  );

  if (role !== "attacker") {
    return filteredBase;
  }

  if (!Number.isFinite(accurateModeValue) || !Number.isFinite(resolvedAccurateValue)) {
    return filteredBase;
  }

  return [
    {
      id: "accurate",
      value: resolvedAccurateValue,
      source: "vantage",
    },
    ...filteredBase,
  ];
}
