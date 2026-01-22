export function parseHits(diceRolls, hitThreshold, critThreshold = 6) {
  let hits = 0;
  let crits = 0;

  diceRolls.forEach((die) => {
    const roll = typeof die === "number" ? die : Number(die?.value ?? 0);
    const kept = typeof die === "number" ? true : die?.kept !== false;
    if (!kept) return;

    if (roll >= critThreshold) {
      crits++;
      if (die && typeof die === "object") {
        die.tags = Array.isArray(die.tags) ? die.tags : [];
        die.tags.push("crit");
      }
    } else if (roll >= hitThreshold) {
      hits++;
      if (die && typeof die === "object") {
        die.tags = Array.isArray(die.tags) ? die.tags : [];
        die.tags.push("hit");
      }
    } else if (die && typeof die === "object") {
      die.tags = Array.isArray(die.tags) ? die.tags : [];
      die.tags.push("miss");
    }
  });

  return { hits, crits };
}

export function allocateDefense({
  attackHits,
  attackCrits,
  defenseHits,
  defenseCrits,
  normalDamage,
  critDamage,
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

  const hasDamageWeights =
    Number.isFinite(normalDamage) && Number.isFinite(critDamage);

  if (hasDamageWeights) {
    const memo = new Map();

    const keyFor = (hits, crits, saves, critSaves) =>
      `${hits}|${crits}|${saves}|${critSaves}`;

    const solve = (hits, crits, saves, critSaves) => {
      const key = keyFor(hits, crits, saves, critSaves);
      const cached = memo.get(key);
      if (cached) return cached;

      let best = {
        remainingHits: hits,
        remainingCrits: crits,
        remainingDefenseHits: saves,
        remainingDefenseCrits: critSaves,
        used: {
          critsOnCrits: 0,
          hitsOnHits: 0,
          critsOnHits: 0,
          doubleHitsOnCrits: 0,
        },
      };
      let bestDamage = hits * normalDamage + crits * critDamage;

      const tryMove = (nextHits, nextCrits, nextSaves, nextCritSaves, delta) => {
        const candidate = solve(nextHits, nextCrits, nextSaves, nextCritSaves);
        const damage =
          candidate.remainingHits * normalDamage +
          candidate.remainingCrits * critDamage;
        if (damage < bestDamage) {
          bestDamage = damage;
          best = {
            remainingHits: candidate.remainingHits,
            remainingCrits: candidate.remainingCrits,
            remainingDefenseHits: candidate.remainingDefenseHits,
            remainingDefenseCrits: candidate.remainingDefenseCrits,
            used: {
              critsOnCrits: candidate.used.critsOnCrits + (delta.critsOnCrits || 0),
              hitsOnHits: candidate.used.hitsOnHits + (delta.hitsOnHits || 0),
              critsOnHits: candidate.used.critsOnHits + (delta.critsOnHits || 0),
              doubleHitsOnCrits:
                candidate.used.doubleHitsOnCrits +
                (delta.doubleHitsOnCrits || 0),
            },
          };
        }
      };

      if (critSaves > 0 && crits > 0) {
        tryMove(hits, crits - 1, saves, critSaves - 1, {
          critsOnCrits: 1,
        });
      }

      if (critSaves > 0 && hits > 0) {
        tryMove(hits - 1, crits, saves, critSaves - 1, {
          critsOnHits: 1,
        });
      }

      if (saves > 0 && hits > 0) {
        tryMove(hits - 1, crits, saves - 1, critSaves, {
          hitsOnHits: 1,
        });
      }

      if (saves >= 2 && crits > 0) {
        tryMove(hits, crits - 1, saves - 2, critSaves, {
          doubleHitsOnCrits: 1,
        });
      }

      memo.set(key, best);
      return best;
    };

    const optimal = solve(
      remainingHits,
      remainingCrits,
      remainingDefenseHits,
      remainingDefenseCrits,
    );

    return {
      remainingHits: optimal.remainingHits,
      remainingCrits: optimal.remainingCrits,
      remainingDefenseHits: optimal.remainingDefenseHits,
      remainingDefenseCrits: optimal.remainingDefenseCrits,
      used: optimal.used,
    };
  }

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