export function getLimitedValue(weaponProfile) {
  const rules = weaponProfile?.wr ?? weaponProfile?.weaponRules ?? weaponProfile?.rules ?? [];
  const arr = Array.isArray(rules) ? rules : [];

  for (const r of arr) {
    if (typeof r === "string") {
      const m = r.trim().toLowerCase().match(/^limited\s+(\d+)$/);
      if (m) return Number(m[1]);
    } else if (r && typeof r === "object") {
      if (String(r.id || "").toLowerCase() === "limited") {
        const n = Number(r.value);
        return Number.isFinite(n) ? n : null;
      }
    }
  }
  return null;
}

export function makeWeaponUsageKey(operativeId, weaponName) {
  return `${operativeId}::${weaponName}`;
}

export function canUseLimitedWeapon({ weaponProfile, operativeId, weaponName, weaponUsage }) {
  const limit = getLimitedValue(weaponProfile);
  if (!limit) return true;

  const key = makeWeaponUsageKey(operativeId, weaponName);
  const used = Number(weaponUsage?.[key]?.used ?? 0);
  return used < limit;
}
