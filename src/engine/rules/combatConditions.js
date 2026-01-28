// src/engine/rules/combatConditions.js

const CONDITIONS = ["cover", "obscured", "vantage"];

const CONDITION_NOTES = {
  cover: {
    target: "defender",
    text: "Cover save available (retain 1 success).",
  },
  obscured: {
    target: "attacker",
    text: "Obscured affects hit retention.",
  },
  vantage: {
    target: "attacker",
    text: "Vantage may deny cover retains.",
  },
};

export function applyConditionNotes(ctx, flags = {}) {
  if (!ctx) return ctx;

  const nextUi = {
    ...(ctx.ui || {}),
    prompts: Array.isArray(ctx.ui?.prompts) ? ctx.ui.prompts : [],
    notes: Array.isArray(ctx.ui?.notes) ? [...ctx.ui.notes] : [],
    appliedRules: { ...(ctx.ui?.appliedRules || {}) },
  };

  nextUi.notes = nextUi.notes.filter(
    (note) => !CONDITIONS.includes(String(note?.ruleId || "")),
  );

  CONDITIONS.forEach((id) => {
    const active = Boolean(flags[id]);
    const meta = CONDITION_NOTES[id];
    nextUi.appliedRules[id] = active;
    if (active && meta) {
      nextUi.notes.push({
        target: meta.target,
        type: "RULE_NOTE",
        ruleId: id,
        text: meta.text,
      });
    }
  });

  return {
    ...ctx,
    ui: nextUi,
  };
}

export function getConditionNoteMeta(id) {
  return CONDITION_NOTES[id] || null;
}
