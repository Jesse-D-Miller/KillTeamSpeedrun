export function parseHits(diceRolls, hitThreshold) {
  let hits = 0;
  let crits = 0;

  diceRolls.forEach((roll) => {
    if (roll === 6) crits++;
    else if (roll >= hitThreshold) hits++;
  });

  return { hits, crits };
}

export function allocateDefense({
  attackHits,
  attackCrits,
  defenseHits,
  defenseCrits,
}) {
  let remainingHits = attackHits;
  let remainingCrits = attackCrits;
  let remainingDefenseHits = defenseHits;
  let remainingDefenseCrits = defenseCrits;

  const used = {
    critsOnCrits: 0,
    hitsOnHits: 0,
    critsOnHits: 0,
    doubleHitsOnCrits: 0,
  };

  // Crits block crits first
  const critsOnCrits = Math.min(remainingDefenseCrits, remainingCrits);
  used.critsOnCrits = critsOnCrits;
  remainingDefenseCrits -= critsOnCrits;
  remainingCrits -= critsOnCrits;

  // Hits block hits
  const hitsOnHits = Math.min(remainingDefenseHits, remainingHits);
  used.hitsOnHits = hitsOnHits;
  remainingDefenseHits -= hitsOnHits;
  remainingHits -= hitsOnHits;

  // Remaining crits can block hits
  const critsOnHits = Math.min(remainingDefenseCrits, remainingHits);
  used.critsOnHits = critsOnHits;
  remainingDefenseCrits -= critsOnHits;
  remainingHits -= critsOnHits;

  // Two hits can block a crit
  const doubleHitsOnCrits = Math.min(
    Math.floor(remainingDefenseHits / 2),
    remainingCrits,
  );
  used.doubleHitsOnCrits = doubleHitsOnCrits;
  remainingDefenseHits -= doubleHitsOnCrits * 2;
  remainingCrits -= doubleHitsOnCrits;

  return {
    remainingHits,
    remainingCrits,
    remainingDefenseHits,
    remainingDefenseCrits,
    used,
  };
}