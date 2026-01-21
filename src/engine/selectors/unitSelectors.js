export function isInjured(unit) {
  if (!unit?.state || !unit?.stats) return false;
  return unit.state.woundsCurrent <= unit.stats.woundsMax / 2;
}

function parseStatValue(value) {
  if (value == null) return null;
  if (typeof value === "number") return value;
  const parsed = Number(String(value).replace("+", ""));
  return Number.isNaN(parsed) ? null : parsed;
}

export function unitMove(unit) {
  if (!unit?.stats) return null;
  const baseMove = parseStatValue(unit.stats.move);
  if (baseMove == null) return null;
  return baseMove + (isInjured(unit) ? -2 : 0);
}

export function weaponHit(weapon, unit) {
  if (!weapon) return null;
  const baseHit = parseStatValue(weapon.hit);
  if (baseHit == null) return null;
  return baseHit + (isInjured(unit) ? 1 : 0);
}

export function statDeltaClass(baseValue, currentValue) {
  if (baseValue == null || currentValue == null) return "";
  if (Number.isNaN(baseValue) || Number.isNaN(currentValue)) return "";
  if (currentValue > baseValue) return "stat--up";
  if (currentValue < baseValue) return "stat--down";
  return "";
}

export function statDeltaClassLowerIsBetter(baseValue, currentValue) {
  if (baseValue == null || currentValue == null) return "";
  if (Number.isNaN(baseValue) || Number.isNaN(currentValue)) return "";
  if (currentValue > baseValue) return "stat--down";
  if (currentValue < baseValue) return "stat--up";
  return "";
}
