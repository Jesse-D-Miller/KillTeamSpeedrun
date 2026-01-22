const normalizeRuleId = (id) =>
  String(id || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");

const rollD6 = () => Math.floor(Math.random() * 6) + 1;

export const RULES = {
  blast: {
    id: "blast",
    hooks: {
      ON_DECLARE_ATTACK: (ctx, rule) => {
        const primaryTargetId = ctx?.inputs?.primaryTargetId;
        if (!primaryTargetId) return;

        const secondaryTargetIds = Array.isArray(ctx?.inputs?.secondaryTargetIds)
          ? ctx.inputs.secondaryTargetIds.filter(Boolean)
          : [];

        const uniqSecondaries = [];
        const seen = new Set([primaryTargetId]);
        for (const id of secondaryTargetIds) {
          if (seen.has(id)) continue;
          seen.add(id);
          uniqSecondaries.push(id);
        }

        ctx.modifiers = ctx.modifiers || {};
        ctx.modifiers.primaryBlast = ctx.modifiers.primaryBlast || {
          targetId: primaryTargetId,
          cover: ctx?.modifiers?.targetInCover ?? ctx?.targetInCover ?? null,
          obscured: ctx?.modifiers?.targetObscured ?? ctx?.targetObscured ?? null,
        };

        ctx.attackQueue = [
          {
            targetId: primaryTargetId,
            isBlastSecondary: false,
            inheritFromPrimary: false,
          },
          ...uniqSecondaries.map((id) => ({
            targetId: id,
            isBlastSecondary: true,
            inheritFromPrimary: true,
          })),
        ];

        ctx.log.push({
          type: "RULE_BLAST_DECLARE",
          detail: {
            x: rule?.value ?? null,
            primaryTargetId,
            secondaryTargetIds: uniqSecondaries,
            queueSize: ctx.attackQueue.length,
          },
        });
      },
      ON_BEGIN_ATTACK_SEQUENCE: (ctx) => {
        const item = ctx?.currentAttackItem;
        if (!item) return;

        ctx.modifiers = ctx.modifiers || {};
        ctx.modifiers.ignoreConcealForTargeting = !!item.isBlastSecondary;

        if (item.inheritFromPrimary) {
          const snap = ctx?.modifiers?.primaryBlast;
          if (snap) {
            if (snap.cover !== null && snap.cover !== undefined) {
              ctx.modifiers.targetInCover = snap.cover;
            }
            if (snap.obscured !== null && snap.obscured !== undefined) {
              ctx.modifiers.targetObscured = snap.obscured;
            }
          }

          ctx.log.push({
            type: "RULE_BLAST_INHERIT",
            detail: {
              targetId: item.targetId,
              inherited: ctx?.modifiers?.primaryBlast ?? null,
            },
          });
        }
      },
      ON_SNAPSHOT_PRIMARY_TARGET_STATE: (ctx) => {
        const item = ctx?.currentAttackItem;
        if (!item || item.isBlastSecondary) return;

        ctx.modifiers = ctx.modifiers || {};
        ctx.modifiers.primaryBlast = {
          targetId: item.targetId,
          cover: ctx?.modifiers?.targetInCover ?? ctx?.targetInCover ?? null,
          obscured: ctx?.modifiers?.targetObscured ?? ctx?.targetObscured ?? null,
        };

        ctx.log.push({
          type: "RULE_BLAST_PRIMARY_SNAPSHOT",
          detail: { ...ctx.modifiers.primaryBlast },
        });
      },
    },
  },
  balanced: {
    id: "balanced",
    hooks: {
      ON_BALANCED: (ctx) => {
        if (!ctx?.inputs?.balancedClick) return;
        if (ctx?.modifiers?.balancedUsed) return;

        const hit = Number(ctx?.weapon?.hit ?? ctx?.weaponProfile?.hit ?? ctx?.hit);
        if (!Number.isFinite(hit) || hit < 2 || hit > 6) return;

        const critThresholdRaw = Number(ctx?.modifiers?.lethalThreshold);
        const critThreshold =
          Number.isFinite(critThresholdRaw) && critThresholdRaw >= 2 && critThresholdRaw <= 6
            ? critThresholdRaw
            : 6;

        const classify = (v) => {
          if (v >= critThreshold) return "crit";
          if (v >= hit) return "hit";
          return "miss";
        };

        const pickLowestIndex = (wantedType) => {
          let picked = -1;
          for (let i = 0; i < ctx.attackDice.length; i++) {
            const die = ctx.attackDice[i];
            const tags = die.tags || [];
            if (tags.includes("rerolled")) continue;
            if (classify(die.value) !== wantedType) continue;

            if (picked === -1 || die.value < ctx.attackDice[picked].value) {
              picked = i;
            }
          }
          return picked;
        };

        let idx = pickLowestIndex("miss");
        if (idx === -1) idx = pickLowestIndex("hit");
        if (idx === -1) idx = pickLowestIndex("crit");
        if (idx === -1) return;

        const before = ctx.attackDice.map((die) => ({ ...die }));

        const next = ctx.attackDice.map((die, i) => {
          if (i !== idx) return die;
          return {
            ...die,
            value: rollD6(),
            tags: [...(die.tags || []), "rerolled", "balanced"],
          };
        });

        ctx.attackDice = next;
        ctx.modifiers.balancedUsed = true;

        ctx.log.push({
          type: "RULE_BALANCED",
          detail: {
            rerolledIndex: idx,
            pickedFrom: classify(before[idx].value),
            before,
            after: next,
          },
        });
      },
    },
  },
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
