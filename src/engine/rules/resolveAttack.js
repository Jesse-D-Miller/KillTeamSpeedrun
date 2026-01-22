import { resolveShooting } from "./resolveShooting";
import { resolveMelee } from "./resolveMelee";
import { normalizeWeaponRules } from "./weaponRules";

const normalizeDice = (dice = []) =>
  dice.map((die) => {
    if (typeof die === "number") {
      return { value: die, kept: true, tags: [] };
    }

    return {
      value: Number(die?.value ?? 0),
      kept: die?.kept !== false,
      tags: Array.isArray(die?.tags) ? die.tags : [],
    };
  });

const createAttackContext = ({
  weapon,
  attacker,
  defender,
  attackDice = [],
  defenseDice = [],
}) => ({
  weapon,
  weaponRules: normalizeWeaponRules(weapon),
  attacker,
  defender,
  phase: "ATTACK_ROLL",
  attackDice: normalizeDice(attackDice),
  defenseDice: normalizeDice(defenseDice),
  hits: { normal: 0, crit: 0 },
  saves: { normal: 0, crit: 0 },
  damage: { normal: 0, crit: 0, total: 0 },
  modifiers: {
    reroll: { attack: 0, defense: 0 },
    lethalThreshold: null,
    attackDiceCount: Number(weapon?.atk ?? 0),
    accurateSpent: 0,
  },
  allocation: null,
  remaining: { hits: 0, crits: 0 },
  log: [],
});

export function resolveAttack(input) {
  if (!input?.weapon) throw new Error("resolveAttack: weapon is required");
  if (!input?.attacker) throw new Error("resolveAttack: attacker is required");
  if (!input?.defender) throw new Error("resolveAttack: defender is required");

  const ctx = createAttackContext(input);

  if (ctx.weapon.mode === "ranged") {
    return resolveShooting(ctx);
  }

  if (ctx.weapon.mode === "melee") {
    return resolveMelee(ctx);
  }

  throw new Error("Unknown weapon mode");
}
