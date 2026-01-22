const normalizeRuleId = (id) =>
  String(id || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");

const rollD6 = () => Math.floor(Math.random() * 6) + 1;

export const RULES = {
  accurate: {
    id: "accurate",
    hooks: {
      BEFORE_ROLL_ATTACK: (ctx, rule) => {
        const x = Number(rule.value);
        if (!Number.isFinite(x) || x <= 0) return;

        const spentRaw = Number(ctx?.inputs?.accurateSpent ?? 0);
        const spent = Math.max(0, Math.min(x, Math.floor(spentRaw)));

        const currentCount = Number(ctx?.modifiers?.attackDiceCount);
        if (!Number.isFinite(currentCount)) return;

        const reduceBy = Math.min(spent, currentCount);
        ctx.modifiers.attackDiceCount = currentCount - reduceBy;
        ctx.modifiers.accurateSpent = reduceBy;

        ctx.log.push({
          type: "RULE_ACCURATE_BEFORE",
          detail: {
            max: x,
            spent: reduceBy,
            diceCountFrom: currentCount,
            diceCountTo: currentCount - reduceBy,
          },
        });
      },
      AFTER_ROLL_ATTACK: (ctx, rule) => {
        const x = Number(rule.value);
        if (!Number.isFinite(x) || x <= 0) return;

        const spent = Number(ctx?.modifiers?.accurateSpent ?? 0);
        if (!Number.isFinite(spent) || spent <= 0) return;

        const hit = Number(ctx?.weapon?.hit ?? ctx?.weaponProfile?.hit ?? ctx?.hit);
        if (!Number.isFinite(hit) || hit < 2 || hit > 6) return;

        const retained = Array.from({ length: spent }, () => ({
          value: hit,
          tags: ["accurate", "retained"],
        }));

        const before = ctx.attackDice.map((die) => ({ ...die }));
        const next = [...retained, ...ctx.attackDice];

        ctx.attackDice = next;

        ctx.log.push({
          type: "RULE_ACCURATE_AFTER",
          detail: { added: spent, hitValue: hit, before, after: next },
        });
      },
    },
  },
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
