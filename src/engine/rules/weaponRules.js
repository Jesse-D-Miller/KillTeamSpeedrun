const normalizeRuleId = (id) =>
  String(id || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");

const defaultRollD6 = () => Math.floor(Math.random() * 6) + 1;

const ensureCtxScaffold = (ctx) => {
  if (!ctx.ui) {
    ctx.ui = {
      prompts: [],
      banners: [],
      suggestedInputs: {},
      disabledOptions: {},
      notes: [],
    };
  }
  if (!ctx.modifiers) ctx.modifiers = {};
  if (!ctx.log) ctx.log = [];
  if (!ctx.inputs) ctx.inputs = {};
};

const addPrompt = (ctx, prompt) => {
  const normalized = {
    type: "PROMPT",
    steps: [],
    ...prompt,
  };
  if (!Array.isArray(normalized.steps) || normalized.steps.length === 0) {
    if (normalized.text) {
      normalized.steps = [normalized.text];
    }
  }
  ctx.ui.prompts.push(normalized);
};

const getWeaponHit = (ctx) =>
  Number(ctx?.weapon?.hit ?? ctx?.weaponProfile?.hit ?? ctx?.hit);

const getLethalThreshold = (ctx) => {
  const critThresholdRaw = Number(ctx?.modifiers?.lethalThreshold);
  const critThreshold =
    Number.isFinite(critThresholdRaw) &&
    critThresholdRaw >= 2 &&
    critThresholdRaw <= 6
      ? critThresholdRaw
      : 6;
  return critThreshold;
};

const classifyDie = (value, hit, critThreshold) => {
  if (value >= critThreshold) return "crit";
  if (value >= hit) return "hit";
  return "miss";
};

const computeCeaselessGroup = (ctx) => {
  const hit = getWeaponHit(ctx);
  if (!Number.isFinite(hit)) return null;
  const misses = (ctx.attackDice || [])
    .map((die) => die.value)
    .filter((value) => value < hit);
  if (misses.length === 0) return null;
  const counts = misses.reduce((acc, value) => {
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
  const chosen = Object.entries(counts)
    .map(([value, count]) => ({ value: Number(value), count }))
    .sort((a, b) => b.count - a.count || a.value - b.value)[0];
  return chosen || null;
};

const computeBalancedSuggestion = (ctx) => {
  const hit = getWeaponHit(ctx);
  if (!Number.isFinite(hit) || !Array.isArray(ctx.attackDice)) return null;
  const critThreshold = getLethalThreshold(ctx);
  const pickLowest = (wanted) => {
    let picked = null;
    for (const die of ctx.attackDice) {
      const tags = die.tags || [];
      if (tags.includes("rerolled")) continue;
      if (classifyDie(die.value, hit, critThreshold) !== wanted) continue;
      if (!picked || die.value < picked.value) {
        picked = die;
      }
    }
    return picked;
  };
  return (
    pickLowest("miss") || pickLowest("hit") || pickLowest("crit") || null
  );
};

export const createRulesEngine = ({ rollD6 = defaultRollD6 } = {}) => {
  const RULES = {
    blast: {
      id: "blast",
      uiLabel: "Blast",
      phases: ["PRE_ROLL"],
      getUiHints: (ctx, rule, phase) => {
        if (phase !== "PRE_ROLL") return;
        ensureCtxScaffold(ctx);
        const x = Number(rule.value);
        if (!Number.isFinite(x) || x <= 0) return;

        const primaryTargetId = ctx?.inputs?.primaryTargetId;
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

        ctx.ui.suggestedInputs.maxSecondaryTargets = x;

        if (primaryTargetId) {
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

          addPrompt(ctx, {
            ruleId: "blast",
            phase,
            steps: [
              `Resolve attacks against: ${ctx.attackQueue
                .map((item) => item.targetId)
                .join(", ")}.`,
            ],
            enabled: true,
          });
        } else {
          addPrompt(ctx, {
            ruleId: "blast",
            phase,
            text: `Blast ${x}: select up to ${x} secondary targets within range.`,
            enabled: true,
          });
        }
      },
      apply: () => {},
      hooks: {
        ON_DECLARE_ATTACK: (ctx, rule) => {
          const primaryTargetId = ctx?.inputs?.primaryTargetId;
          if (!primaryTargetId) return;

          const secondaryTargetIds = Array.isArray(
            ctx?.inputs?.secondaryTargetIds,
          )
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
            obscured:
              ctx?.modifiers?.targetObscured ?? ctx?.targetObscured ?? null,
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
            obscured:
              ctx?.modifiers?.targetObscured ?? ctx?.targetObscured ?? null,
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
      uiLabel: "Balanced",
      phases: ["ROLL"],
      getUiHints: (ctx, rule, phase) => {
        if (phase !== "ROLL") return;
        ensureCtxScaffold(ctx);
        const enabled =
          !ctx.modifiers?.balancedUsed &&
          Array.isArray(ctx.attackDice) &&
          ctx.attackDice.length > 0;
        addPrompt(ctx, {
          ruleId: "balanced",
          phase,
          text: "Balanced: reroll one die (lowest miss > hit > crit).",
          enabled,
        });
      },
      apply: () => {},
      onClick: (ctx, rule) => {
        RULES.balanced.hooks.ON_CLICK?.(ctx, rule);
      },
      hooks: {
        ON_BALANCED: (ctx) => {
          if (!ctx?.inputs?.balancedClick) return;
          ensureCtxScaffold(ctx);
          if (ctx?.modifiers?.balancedUsed) return;

          const suggested = computeBalancedSuggestion(ctx);
          if (!suggested) return;

          const hit = getWeaponHit(ctx);
          const critThreshold = getLethalThreshold(ctx);
          const recommendation = {
            value: suggested.value,
            type: classifyDie(suggested.value, hit, critThreshold),
          };

          ctx.modifiers.balancedUsed = true;
          ctx.ui.suggestedInputs.balancedTarget = {
            value: suggested.value,
            type: recommendation.type,
          };

          addPrompt(ctx, {
            ruleId: "balanced",
            phase: "ROLL",
            steps: [
              "Reroll one attack die (recommend: lowest miss, then lowest hit, then lowest crit).",
            ],
            enabled: true,
          });

          ctx.log.push({
            type: "RULE_BALANCED_CLICK",
            detail: {
              phase: "ROLL",
              recommendation,
            },
          });
        },
        ON_CLICK: (ctx) => {
          if (ctx?.inputs?.phase !== "ROLL") return;
          if (ctx?.inputs?.clickedRuleId !== "balanced") return;
          ctx.inputs.balancedClick = true;
          RULES.balanced.hooks.ON_BALANCED(ctx);
        },
      },
    },
    accurate: {
      id: "accurate",
      uiLabel: "Accurate",
      phases: ["PRE_ROLL", "POST_ROLL"],
      getUiHints: (ctx, rule, phase) => {
        ensureCtxScaffold(ctx);
        if (phase === "PRE_ROLL") {
          const x = Number(rule.value);
          if (!Number.isFinite(x) || x <= 0) return;
          const max = Math.floor(x);
          ctx.ui.suggestedInputs.accurateMax = max;
          ctx.ui.suggestedInputs.accurateSpentRange = { min: 0, max };
          addPrompt(ctx, {
            ruleId: "accurate",
            phase,
            text: `Accurate ${max}: choose up to ${max} dice to retain; roll ${max} fewer dice.`,
            enabled: max > 0,
          });
        }
        if (phase === "POST_ROLL") {
          const spent = Number(
            ctx?.modifiers?.accurateSpent ?? ctx?.inputs?.accurateSpent ?? 0,
          );
          if (spent > 0) {
            ctx.ui.suggestedInputs.retainHits =
              (ctx.ui.suggestedInputs.retainHits || 0) + spent;
            addPrompt(ctx, {
              ruleId: "accurate",
              phase,
              text: `Accurate: retain ${spent} hit${spent === 1 ? "" : "s"}.`,
              enabled: true,
            });
          }
        }
      },
      apply: () => {},
      onClick: (ctx, rule) => {
        RULES.accurate.hooks.ON_CLICK?.(ctx, rule);
      },
      hooks: {
        BEFORE_ROLL_ATTACK: (ctx, rule) => {
          ensureCtxScaffold(ctx);
          const x = Number(rule.value);
          if (!Number.isFinite(x) || x <= 0) return;

          const spentRaw = Number(ctx?.inputs?.accurateSpent ?? 0);
          const spent = Math.max(0, Math.min(x, Math.floor(spentRaw)));

          const currentCount = Number(ctx?.modifiers?.attackDiceCount);
          if (!Number.isFinite(currentCount)) return;

          const reduceBy = Math.min(spent, currentCount);
          ctx.modifiers.attackDiceCount = currentCount - reduceBy;
          ctx.modifiers.accurateSpent = reduceBy;
          ctx.ui.suggestedInputs.attackDiceCountDelta = -reduceBy;
          ctx.ui.suggestedInputs.accurateSpent = reduceBy;

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
          ensureCtxScaffold(ctx);
          const x = Number(rule.value);
          if (!Number.isFinite(x) || x <= 0) return;

          const spent = Number(ctx?.modifiers?.accurateSpent ?? 0);
          if (!Number.isFinite(spent) || spent <= 0) return;

          const hit = Number(
            ctx?.weapon?.hit ?? ctx?.weaponProfile?.hit ?? ctx?.hit,
          );
          if (!Number.isFinite(hit) || hit < 2 || hit > 6) return;

          ctx.ui.suggestedInputs.retainHits =
            (ctx.ui.suggestedInputs.retainHits || 0) + spent;

          ctx.log.push({
            type: "RULE_ACCURATE_AFTER",
            detail: { added: spent, hitValue: hit },
          });
        },
        ON_CLICK: (ctx, rule) => {
          ensureCtxScaffold(ctx);
          if (ctx?.inputs?.phase !== "PRE_ROLL") return;
          if (ctx?.inputs?.clickedRuleId !== "accurate") return;
          const x = Number(rule.value);
          if (!Number.isFinite(x) || x <= 0) return;
          const spentRaw = Number(ctx?.inputs?.accurateSpent ?? 0);
          const spent = Math.max(0, Math.min(x, Math.floor(spentRaw)));
          ctx.modifiers.accurateSpent = spent;
          ctx.ui.suggestedInputs.attackDiceCountDelta = -spent;
          ctx.ui.suggestedInputs.accurateSpent = spent;
          addPrompt(ctx, {
            ruleId: "accurate",
            phase: "PRE_ROLL",
            steps: [
              `Roll ${Math.max(0, Number(ctx?.weapon?.atk ?? 0) - spent)} dice.`,
              `Treat ${spent} ${spent === 1 ? "die" : "dice"} as retained hits.`,
            ],
            enabled: true,
          });
          ctx.log.push({
            type: "RULE_ACCURATE_CLICK",
            detail: { phase: "PRE_ROLL", max: x, spent },
          });
        },
      },
    },
    ceaseless: {
      id: "ceaseless",
      uiLabel: "Ceaseless",
      phases: ["ROLL"],
      getUiHints: (ctx, rule, phase) => {
        if (phase !== "ROLL") return;
        ensureCtxScaffold(ctx);
        const chosen = computeCeaselessGroup(ctx);
        const enabled = Boolean(chosen);
        if (chosen) {
          ctx.ui.suggestedInputs.ceaselessGroupValue = chosen.value;
        }
        addPrompt(ctx, {
          ruleId: "ceaseless",
          phase,
          text: "Ceaseless: reroll all dice showing the most common miss value.",
          enabled,
        });
      },
      apply: () => {},
      onClick: (ctx, rule) => {
        RULES.ceaseless.hooks.ON_CLICK?.(ctx, rule);
      },
      hooks: {
        ON_ROLL_ATTACK: (ctx) => {
          ensureCtxScaffold(ctx);
          const chosen = computeCeaselessGroup(ctx);
          if (!chosen) return;
          ctx.ui.suggestedInputs.ceaselessGroupValue = chosen.value;
          ctx.log.push({
            type: "RULE_CEASELESS_SUGGEST",
            detail: { value: chosen.value, count: chosen.count },
          });
        },
        ON_CLICK: (ctx) => {
          ensureCtxScaffold(ctx);
          if (ctx?.inputs?.phase !== "ROLL") return;
          if (ctx?.inputs?.clickedRuleId !== "ceaseless") return;
          if (ctx?.modifiers?.ceaselessUsed) return;
          const chosen =
            Number(ctx?.inputs?.ceaselessGroupValue) ||
            computeCeaselessGroup(ctx)?.value ||
            null;
          ctx.modifiers.ceaselessUsed = true;
          ctx.ui.suggestedInputs.ceaselessGroupValue = chosen;
          ctx.ui.prompts.push({
            ruleId: "ceaseless",
            phase: "ROLL",
            text: "Ceaseless: reroll all dice showing the most common miss value.",
            enabled: true,
          });
          ctx.log.push({
            type: "RULE_CEASELESS_CLICK",
            detail: { phase: "ROLL", value: chosen },
          });
        },
      },
    },
    lethal: {
      id: "lethal",
      uiLabel: "Lethal",
      phases: ["ROLL"],
      getUiHints: (ctx, rule, phase) => {
        if (phase !== "ROLL") return;
        ensureCtxScaffold(ctx);
        const value = Number(rule.value);
        if (!Number.isFinite(value)) return;
        addPrompt(ctx, {
          ruleId: "lethal",
          phase,
          text: `Lethal ${value}+: crit on ${value}+`,
          enabled: value >= 2,
        });
      },
      apply: (ctx, rule, phase) => {
        if (phase !== "ROLL") return;
        ensureCtxScaffold(ctx);
        const value = Number(rule.value);
        if (!Number.isFinite(value)) return;
        ctx.modifiers.lethalThreshold = value;
        ctx.log.push({
          type: "RULE_LETHAL_APPLY",
          detail: { threshold: value, phase: "ROLL" },
        });
      },
      hooks: {
        ON_ROLL_ATTACK: (ctx, rule) => {
          ensureCtxScaffold(ctx);
          const value = Number(rule.value);
          if (Number.isFinite(value)) {
            ctx.modifiers.lethalThreshold = value;
            ctx.log.push({
              type: "RULE_LETHAL_APPLY",
              detail: { threshold: value, phase: "ROLL" },
            });
          }
        },
      },
    },

    devastating: {
      id: "devastating",
      uiLabel: "Devastating",
      phases: ["LOCK_IN"],
      getUiHints: (ctx, rule, phase) => {
        if (phase !== "LOCK_IN") return;
        ensureCtxScaffold(ctx);
        const x = Number(rule.value);
        if (!Number.isFinite(x) || x <= 0) return;
        ctx.ui.suggestedInputs.devastatingDamagePerCrit = x;
        addPrompt(ctx, {
          ruleId: "devastating",
          phase,
          text: `Devastating ${x}: deal ${x} damage per retained crit on lock-in.`,
          enabled: true,
        });
      },
      apply: () => {},
      onClick: (ctx, rule) => {
        RULES.devastating.hooks.ON_CLICK?.(ctx, rule);
      },
      hooks: {
        ON_LOCK_IN_ATTACK: (ctx, rule) => {
          ensureCtxScaffold(ctx);
          // Only proc when lock-in happens
          if (!ctx?.inputs?.attackLockedIn) return;

          // Prevent double-proc
          if (ctx.modifiers.devastatingApplied) return;

          const xRaw = Number(rule?.value);
          const x = Number.isFinite(xRaw) ? xRaw : 0;
          if (x <= 0) return;

          const attackDice = Array.isArray(ctx.attackDice)
            ? ctx.attackDice
            : [];

          // Count retained crits by tags
          const retainedCrits = attackDice.filter((die) => {
            const tags = Array.isArray(die?.tags) ? die.tags : [];
            return tags.includes("retained") && tags.includes("crit");
          }).length;

          if (retainedCrits <= 0) return;

          const damage = retainedCrits * x;
          ctx.ui.suggestedInputs.applyDamage = damage;

          ctx.modifiers.devastatingApplied = true;

          ctx.log.push({
            type: "RULE_DEVASTATING_APPLY",
            detail: {
              x,
              retainedCrits,
              damage,
              phase: "LOCK_IN",
            },
          });
        },
        ON_CLICK: (ctx, rule) => {
          ensureCtxScaffold(ctx);
          if (ctx?.inputs?.phase !== "LOCK_IN") return;
          if (ctx?.inputs?.clickedRuleId !== "devastating") return;
          if (ctx.modifiers.devastatingApplied) return;
          const xRaw = Number(rule?.value);
          const x = Number.isFinite(xRaw) ? xRaw : 0;
          if (x <= 0) return;
          const retainedCrits = Number(ctx?.inputs?.retainedCrits ?? 0);
          const damage = retainedCrits * x;
          ctx.ui.suggestedInputs.applyDamage = damage;
          ctx.modifiers.devastatingApplied = true;
          if (ctx?.inputs?.killed) {
            ctx.modifiers.combatEnded = true;
            ctx.modifiers.targetKilled = true;
          }
          ctx.log.push({
            type: "RULE_DEVASTATING_CLICK",
            detail: {
              phase: "LOCK_IN",
              x,
              retainedCrits,
              damage,
              killed: Boolean(ctx?.inputs?.killed),
            },
          });
        },
      },
    },

    brutal: {
      id: "brutal",
      uiLabel: "Brutal",
      phases: ["RESOLVE_BLOCKS"],
      getUiHints: (ctx, rule, phase) => {
        if (phase !== "RESOLVE_BLOCKS") return;
        ensureCtxScaffold(ctx);
        addPrompt(ctx, {
          ruleId: "brutal",
          phase,
          text: "Brutal: only crits can block (cover still applies).",
          enabled: true,
        });
      },
      apply: (ctx, rule, phase) => {
        if (phase !== "RESOLVE_BLOCKS") return;
        ensureCtxScaffold(ctx);
        const coverBlocks = Array.isArray(ctx.coverBlocks)
          ? ctx.coverBlocks
          : [];

        const critBlocks = (ctx.defenseDice || []).filter(
          (die) => Array.isArray(die.tags) && die.tags.includes("crit"),
        );
        const normalBlocks = (ctx.defenseDice || []).filter(
          (die) =>
            Array.isArray(die.tags) &&
            die.tags.includes("success") &&
            !die.tags.includes("crit"),
        );

        ctx.eligibleBlocks = [...coverBlocks, ...critBlocks];
        ctx.ui.disabledOptions.defenseBlocks = "normal";
        ctx.log.push({
          type: "RULE_BRUTAL",
          detail: {
            removedNormalBlocks: normalBlocks.length,
            remainingCritBlocks: critBlocks.length,
          },
        });
      },
      onClick: (ctx, rule) => {
        RULES.brutal.hooks.ON_CLICK?.(ctx, rule);
      },
      hooks: {
        ON_RESOLVE_BLOCKS: (ctx) => {
          ensureCtxScaffold(ctx);
          const coverBlocks = Array.isArray(ctx.coverBlocks)
            ? ctx.coverBlocks
            : [];

          const critBlocks = (ctx.defenseDice || []).filter(
            (die) => Array.isArray(die.tags) && die.tags.includes("crit"),
          );
          const normalBlocks = (ctx.defenseDice || []).filter(
            (die) =>
              Array.isArray(die.tags) &&
              die.tags.includes("success") &&
              !die.tags.includes("crit"),
          );

          ctx.eligibleBlocks = [...coverBlocks, ...critBlocks];
          ctx.ui.disabledOptions.defenseBlocks = "normal";
          ctx.ui.prompts.push({
            ruleId: "brutal",
            phase: "RESOLVE_BLOCKS",
            text: "Brutal: only crits can block (cover still applies).",
            enabled: true,
          });

          ctx.log.push({
            type: "RULE_BRUTAL",
            detail: {
              removedNormalBlocks: normalBlocks.length,
              remainingCritBlocks: critBlocks.length,
            },
          });
        },
        ON_CLICK: (ctx) => {
          ensureCtxScaffold(ctx);
          if (ctx?.inputs?.phase !== "RESOLVE_BLOCKS") return;
          if (ctx?.inputs?.clickedRuleId !== "brutal") return;
          ctx.ui.disabledOptions.defenseBlocks = "normal";
          ctx.log.push({
            type: "RULE_BRUTAL_CLICK",
            detail: { phase: "RESOLVE_BLOCKS" },
          });
        },
      },
    },
    heavy: {
      id: "heavy",
      uiLabel: "Heavy",
      phases: ["PRE_ROLL"],
      getUiHints: (ctx, rule, phase) => {
        if (phase !== "PRE_ROLL") return;
        ensureCtxScaffold(ctx);
        addPrompt(ctx, {
          ruleId: "heavy",
          phase,
          text: "Heavy: resolve heavy restrictions before rolling.",
          enabled: true,
        });
      },
      apply: () => {},
    },
    hot: {
      id: "hot",
      uiLabel: "Hot",
      phases: ["POST_ROLL"],
      getUiHints: (ctx, rule, phase) => {
        if (phase !== "POST_ROLL") return;
        ensureCtxScaffold(ctx);
        addPrompt(ctx, {
          ruleId: "hot",
          phase,
          text: "Hot: resolve hot checks after rolling.",
          enabled: true,
        });
      },
      apply: () => {},
    },
    limited: {
      id: "limited",
      uiLabel: "Limited",
      phases: ["PRE_ROLL"],
      getUiHints: (ctx, rule, phase) => {
        if (phase !== "PRE_ROLL") return;
        ensureCtxScaffold(ctx);
        addPrompt(ctx, {
          ruleId: "limited",
          phase,
          text: "Limited: check remaining uses before rolling.",
          enabled: true,
        });
      },
      apply: () => {},
    },
    piercing: {
      id: "piercing",
      uiLabel: "Piercing",
      phases: ["RESOLVE_BLOCKS"],
      getUiHints: (ctx, rule, phase) => {
        if (phase !== "RESOLVE_BLOCKS") return;
        ensureCtxScaffold(ctx);
        const value = Number(rule.value);
        const suffix = Number.isFinite(value) ? ` ${value}` : "";
        addPrompt(ctx, {
          ruleId: "piercing",
          phase,
          text: `Piercing${suffix}: reduce defender blocks accordingly.`,
          enabled: true,
        });
      },
      apply: () => {},
    },
    "piercing-crits": {
      id: "piercing-crits",
      uiLabel: "Piercing Crits",
      phases: ["RESOLVE_BLOCKS"],
      getUiHints: (ctx, rule, phase) => {
        if (phase !== "RESOLVE_BLOCKS") return;
        ensureCtxScaffold(ctx);
        addPrompt(ctx, {
          ruleId: "piercing-crits",
          phase,
          text: "Piercing Crits: adjust blocks for critical hits.",
          enabled: true,
        });
      },
      apply: () => {},
    },
    punishing: {
      id: "punishing",
      uiLabel: "Punishing",
      phases: ["POST_ROLL"],
      getUiHints: (ctx, rule, phase) => {
        if (phase !== "POST_ROLL") return;
        ensureCtxScaffold(ctx);
        addPrompt(ctx, {
          ruleId: "punishing",
          phase,
          text: "Punishing: resolve punishing effect after rolling.",
          enabled: true,
        });
      },
      apply: () => {},
    },
    range: {
      id: "range",
      uiLabel: "Range",
      phases: ["DECLARE_ATTACK"],
      getUiHints: (ctx, rule, phase) => {
        if (phase !== "DECLARE_ATTACK") return;
        ensureCtxScaffold(ctx);
        addPrompt(ctx, {
          ruleId: "range",
          phase,
          text: "Range: confirm target is within range.",
          enabled: true,
        });
      },
      apply: () => {},
    },
    relentless: {
      id: "relentless",
      uiLabel: "Relentless",
      phases: ["ROLL"],
      getUiHints: (ctx, rule, phase) => {
        if (phase !== "ROLL") return;
        ensureCtxScaffold(ctx);
        addPrompt(ctx, {
          ruleId: "relentless",
          phase,
          text: "Relentless: reroll any misses.",
          enabled: true,
        });
      },
      apply: () => {},
    },
    rending: {
      id: "rending",
      uiLabel: "Rending",
      phases: ["POST_ROLL"],
      getUiHints: (ctx, rule, phase) => {
        if (phase !== "POST_ROLL") return;
        ensureCtxScaffold(ctx);
        addPrompt(ctx, {
          ruleId: "rending",
          phase,
          text: "Rending: resolve rending conversions.",
          enabled: true,
        });
      },
      apply: () => {},
    },
    saturate: {
      id: "saturate",
      uiLabel: "Saturate",
      phases: ["RESOLVE_BLOCKS"],
      getUiHints: (ctx, rule, phase) => {
        if (phase !== "RESOLVE_BLOCKS") return;
        ensureCtxScaffold(ctx);
        addPrompt(ctx, {
          ruleId: "saturate",
          phase,
          text: "Saturate: reduce defender cover benefits.",
          enabled: true,
        });
      },
      apply: () => {},
    },
    seek: {
      id: "seek",
      uiLabel: "Seek",
      phases: ["DECLARE_ATTACK"],
      getUiHints: (ctx, rule, phase) => {
        if (phase !== "DECLARE_ATTACK") return;
        ensureCtxScaffold(ctx);
        addPrompt(ctx, {
          ruleId: "seek",
          phase,
          text: "Seek: ignore obscuring/cover per rule.",
          enabled: true,
        });
      },
      apply: () => {},
    },
    severe: {
      id: "severe",
      uiLabel: "Severe",
      phases: ["POST_ROLL"],
      getUiHints: (ctx, rule, phase) => {
        if (phase !== "POST_ROLL") return;
        ensureCtxScaffold(ctx);
        addPrompt(ctx, {
          ruleId: "severe",
          phase,
          text: "Severe: resolve severe effect after rolling.",
          enabled: true,
        });
      },
      apply: () => {},
    },
    shock: {
      id: "shock",
      uiLabel: "Shock",
      phases: ["POST_ROLL"],
      getUiHints: (ctx, rule, phase) => {
        if (phase !== "POST_ROLL") return;
        ensureCtxScaffold(ctx);
        addPrompt(ctx, {
          ruleId: "shock",
          phase,
          text: "Shock: resolve shock effects after rolling.",
          enabled: true,
        });
      },
      apply: () => {},
    },
    silent: {
      id: "silent",
      uiLabel: "Silent",
      phases: ["DECLARE_ATTACK"],
      getUiHints: (ctx, rule, phase) => {
        if (phase !== "DECLARE_ATTACK") return;
        ensureCtxScaffold(ctx);
        addPrompt(ctx, {
          ruleId: "silent",
          phase,
          text: "Silent: resolve silent targeting constraints.",
          enabled: true,
        });
      },
      apply: () => {},
    },
    stun: {
      id: "stun",
      uiLabel: "Stun",
      phases: ["POST_ROLL"],
      getUiHints: (ctx, rule, phase) => {
        if (phase !== "POST_ROLL") return;
        ensureCtxScaffold(ctx);
        addPrompt(ctx, {
          ruleId: "stun",
          phase,
          text: "Stun: resolve stun effects after rolling.",
          enabled: true,
        });
      },
      apply: () => {},
    },
    torrent: {
      id: "torrent",
      uiLabel: "Torrent",
      phases: ["DECLARE_ATTACK"],
      getUiHints: (ctx, rule, phase) => {
        if (phase !== "DECLARE_ATTACK") return;
        ensureCtxScaffold(ctx);
        addPrompt(ctx, {
          ruleId: "torrent",
          phase,
          text: "Torrent: resolve torrent targeting rules.",
          enabled: true,
        });
      },
      apply: () => {},
    },
  };

  const runWeaponRuleHook = (ctx, hookName) => {
    for (const rule of ctx.weaponRules || []) {
      const impl = RULES[rule.id];
      const fn = impl?.hooks?.[hookName];
      if (fn) fn(ctx, rule);
    }
  };

  return { RULES, runWeaponRuleHook };
};

export const { RULES, runWeaponRuleHook } = createRulesEngine();

export const applyWeaponRules = (ctx, phase) => {
  ensureCtxScaffold(ctx);
  const rules = Array.isArray(ctx.weaponRules) ? ctx.weaponRules : [];
  rules.forEach((rule) => {
    const impl = RULES[rule.id];
    if (!impl) return;
    const phases = Array.isArray(impl.phases) ? impl.phases : [];
    if (phase && !phases.includes(phase)) return;
    if (typeof impl.getUiHints === "function") {
      impl.getUiHints(ctx, rule, phase);
    }
    if (typeof impl.apply === "function") {
      impl.apply(ctx, rule, phase);
    }
  });
  return ctx;
};

export const clickWeaponRule = (ctx, ruleId, phase, payload = {}) => {
  ensureCtxScaffold(ctx);
  const normalized = normalizeRuleId(ruleId);
  const rule = (ctx.weaponRules || []).find(
    (entry) => normalizeRuleId(entry.id) === normalized,
  );
  if (!rule) return ctx;
  ctx.inputs = {
    ...ctx.inputs,
    ...payload,
    clickedRuleId: normalized,
    phase,
  };
  const impl = RULES[normalized];
  const hook = impl?.hooks?.ON_CLICK;
  if (hook) hook(ctx, rule);

  const alreadyPrompted = (ctx.ui.prompts || []).some(
    (prompt) => prompt.ruleId === normalized && prompt.phase === phase,
  );
  if (!alreadyPrompted) {
    const label = impl?.uiLabel || normalized;
    addPrompt(ctx, {
      ruleId: normalized,
      phase,
      text: `${label}: resolve this rule now.`,
      enabled: true,
    });
  }

  ctx.log.push({
    type: "RULE_CLICKED",
    detail: {
      ruleId: normalized,
      phase,
      payload,
    },
  });

  if (normalized === "blast" && phase === "PRE_ROLL") {
    const primaryTargetId = ctx?.inputs?.primaryTargetId;
    if (!primaryTargetId) return ctx;
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
    ctx.attackQueue = [
      { targetId: primaryTargetId, isBlastSecondary: false, inheritFromPrimary: false },
      ...uniqSecondaries.map((id) => ({
        targetId: id,
        isBlastSecondary: true,
        inheritFromPrimary: true,
      })),
    ];
    ctx.log.push({
      type: "RULE_BLAST_DECLARE_CLICK",
      detail: {
        x: rule?.value ?? null,
        primaryTargetId,
        secondaryTargetIds: uniqSecondaries,
        queueSize: ctx.attackQueue.length,
      },
    });
  }

  return ctx;
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
