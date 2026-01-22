import { allocateDefense, parseHits } from "./resolveDice.js";
import { runWeaponRuleHook } from "./weaponRules";

export function resolveShooting(ctx) {
  if (!ctx?.attacker) throw new Error("resolveShooting: attacker is required");
  if (!ctx?.defender) throw new Error("resolveShooting: defender is required");
  if (!ctx?.weapon) throw new Error("resolveShooting: weapon is required");

  const rollAttackDice = (count) =>
    Array.from({ length: count }, () => ({ value: Math.floor(Math.random() * 6) + 1, kept: true, tags: [] }));

  ctx.phase = "DECLARE_ATTACK";
  runWeaponRuleHook(ctx, "ON_DECLARE_ATTACK");

  ctx.phase = "ATTACK_ROLL";
  ctx.modifiers.attackDiceCount = Number(ctx.weapon?.atk ?? ctx.modifiers.attackDiceCount ?? 0);
  runWeaponRuleHook(ctx, "BEFORE_ROLL_ATTACK");
  const attackDiceCount = Number(ctx.modifiers.attackDiceCount);
  if (!Array.isArray(ctx.attackDice) || ctx.attackDice.length === 0) {
    if (Number.isFinite(attackDiceCount) && attackDiceCount > 0) {
      ctx.attackDice = rollAttackDice(attackDiceCount);
    }
  } else if (Number.isFinite(attackDiceCount) && attackDiceCount >= 0) {
    ctx.attackDice = ctx.attackDice.slice(0, attackDiceCount);
  }
  runWeaponRuleHook(ctx, "ON_ROLL_ATTACK");
  const critThreshold = ctx.modifiers.lethalThreshold ?? 6;
  const attackResults = parseHits(ctx.attackDice, ctx.weapon.hit, critThreshold);
  ctx.hits = { normal: attackResults.hits, crit: attackResults.crits };
  runWeaponRuleHook(ctx, "AFTER_ROLL_ATTACK");

  ctx.phase = "DEFENSE_ROLL";
  runWeaponRuleHook(ctx, "ON_ROLL_DEFENSE");
  const defenseResults = parseHits(ctx.defenseDice, ctx.defender.stats.save);
  ctx.saves = { normal: defenseResults.hits, crit: defenseResults.crits };
  runWeaponRuleHook(ctx, "AFTER_ROLL_DEFENSE");

  ctx.phase = "ALLOCATE";
  const [normalDmg, critDmg] = ctx.weapon.dmg.split("/").map(Number);
  const allocation = allocateDefense({
    attackHits: ctx.hits.normal,
    attackCrits: ctx.hits.crit,
    defenseHits: ctx.saves.normal,
    defenseCrits: ctx.saves.crit,
    normalDamage: normalDmg,
    critDamage: critDmg,
  });

  ctx.allocation = allocation;
  ctx.remaining = {
    hits: allocation.remainingHits,
    crits: allocation.remainingCrits,
  };

  ctx.phase = "DAMAGE";
  const normalTotal = allocation.remainingHits * normalDmg;
  const critTotal = allocation.remainingCrits * critDmg;

  ctx.damage = {
    normal: normalTotal,
    crit: critTotal,
    total: normalTotal + critTotal,
  };

  runWeaponRuleHook(ctx, "AFTER_DAMAGE");

  ctx.log.push({
    type: "ATTACK_RESOLVED",
    detail: {
      hits: ctx.hits,
      saves: ctx.saves,
      allocation,
      remaining: ctx.remaining,
      damage: ctx.damage,
    },
  });

  ctx.phase = "RESOLVED";

  return ctx;
}
