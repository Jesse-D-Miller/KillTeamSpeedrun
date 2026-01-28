// src/engine/rules/combatCtxEffects.js

export const EFFECT_TARGETS = Object.freeze({
  ATTACKER: "attacker",
  DEFENDER: "defender",
});

export const EFFECT_COLORS = Object.freeze({
  RED: "red",
  YELLOW: "yellow",
  GREEN: "green",
});

const ensureEffects = (ctx) => {
  if (!ctx.effects) {
    ctx.effects = { attacker: [], defender: [] };
    return ctx;
  }
  ctx.effects.attacker = Array.isArray(ctx.effects.attacker)
    ? ctx.effects.attacker
    : [];
  ctx.effects.defender = Array.isArray(ctx.effects.defender)
    ? ctx.effects.defender
    : [];
  return ctx;
};

export function addEffect(ctx, effect) {
  if (!ctx || !effect?.id || !effect?.target) return ctx;
  ensureEffects(ctx);
  const list = effect.target === EFFECT_TARGETS.DEFENDER
    ? ctx.effects.defender
    : ctx.effects.attacker;

  const next = list.filter((item) => item?.id !== effect.id);
  next.push(effect);

  if (effect.target === EFFECT_TARGETS.DEFENDER) {
    ctx.effects.defender = next;
  } else {
    ctx.effects.attacker = next;
  }

  return ctx;
}

export function removeEffect(ctx, effectId) {
  if (!ctx || !effectId) return ctx;
  ensureEffects(ctx);
  ctx.effects.attacker = ctx.effects.attacker.filter((item) => item?.id !== effectId);
  ctx.effects.defender = ctx.effects.defender.filter((item) => item?.id !== effectId);
  return ctx;
}

export function hasEffect(ctx, target, effectId) {
  if (!ctx || !effectId) return false;
  ensureEffects(ctx);
  const list = target === EFFECT_TARGETS.DEFENDER
    ? ctx.effects.defender
    : ctx.effects.attacker;
  return list.some((item) => item?.id === effectId);
}
