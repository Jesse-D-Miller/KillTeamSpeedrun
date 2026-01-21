import { parseHits } from "./resolveDice.js";

export function resolveShooting({
  attacker,
  defender,
  weapon,
  attackDice,
  defenseDice,
}) {
  if (!attacker) throw new Error("resolveShooting: attacker is required");
  if (!defender) throw new Error("resolveShooting: defender is required");
  if (!weapon) throw new Error("resolveShooting: weapon is required");

  const { hits, crits } = parseHits(attackDice, weapon.hit);
  const defense = parseHits(defenseDice, defender.stats.save);

  let remainingHits = hits;
  let remainingCrits = crits;

  // save against hits
  const savesUsed = Math.min(defense.hits, remainingHits);
  remainingHits -= savesUsed;

  // save against crits
  const critsSavesUsed = Math.min(defense.crits, remainingCrits);
  remainingCrits -= critsSavesUsed;

  // damage calculation
  const [normalDmg, critDmg] = weapon.dmg.split("/").map(Number);

  const totalDamage = remainingHits * normalDmg + remainingCrits * critDmg;

  return {
    damage: totalDamage,
    breakdown: {
      hits,
      crits,
      saves: defense,
      remainingHits,
      remainingCrits,
    },
  };
}
