const normalizeRuleId = (id) =>
  String(id || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");

const rollD6 = () => Math.floor(Math.random() * 6) + 1;

export const RULES = {
  ceaseless: {
    id: "ceaseless",
    hooks: {
      ON_ROLL_ATTACK: (ctx) => {
        const before = ctx.attackDice.map((die) => ({ ...die }));
        const next = ctx.attackDice.map((die) => {
          if (die.value !== 1) return die;
          return {
            ...die,
            value: rollD6(),
            tags: [...(die.tags || []), "rerolled"],
          };
        });
        ctx.attackDice = next;
        ctx.log.push({
          type: "RULE_CEASELESS",
          detail: { before, after: next },
        });
      },
    },
  },
  lethal: {
    id: "lethal",
    hooks: {
      ON_ROLL_ATTACK: (ctx, rule) => {
        const value = Number(rule.value);
        if (Number.isFinite(value)) {
          ctx.modifiers.lethalThreshold = value;
          ctx.log.push({
            type: "RULE_LETHAL",
            detail: { threshold: value },
          });
        }
      },
    },
  },
};

export const normalizeWeaponRules = (weapon) => {
  const raw = weapon?.wr ?? weapon?.rules ?? [];
  if (!raw || raw === "-") return [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list
    .filter(Boolean)
    .map((rule) => (typeof rule === "string" ? { id: rule } : rule))
    .map((rule) => ({
      ...rule,
      id: normalizeRuleId(rule.id),
    }))
    .filter((rule) => rule.id.length > 0);
};

export const runWeaponRuleHook = (ctx, hookName) => {
  for (const rule of ctx.weaponRules || []) {
    const impl = RULES[rule.id];
    const fn = impl?.hooks?.[hookName];
    if (fn) fn(ctx, rule);
  }
};
