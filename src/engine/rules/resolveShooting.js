import { allocateDefense, parseHits } from "./resolveDice.js";

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

  const allocation = allocateDefense({
    attackHits: hits,
    attackCrits: crits,
    defenseHits: defense.hits,
    defenseCrits: defense.crits,
  });

  const remainingHits = allocation.remainingHits;
  const remainingCrits = allocation.remainingCrits;

  // damage calculation
  const [normalDmg, critDmg] = weapon.dmg.split("/").map(Number);

  const totalDamage = remainingHits * normalDmg + remainingCrits * critDmg;

  return {
    damage: totalDamage,
    breakdown: {
      hits,
      crits,
      saves: defense,
      allocation,
      remainingHits,
      remainingCrits,
    },
  };
}
