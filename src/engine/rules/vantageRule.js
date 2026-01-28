// src/engine/rules/vantageRule.js

export function getVantageOptions(targetOrder) {
  const order = String(targetOrder || "").toLowerCase();
  if (order === "engage") return [4, 2];
  return [];
}

export function applyVantage(ctx, { targetOrder, distance } = {}) {
  const nextCtx = {
    ...ctx,
    weaponRules: Array.isArray(ctx?.weaponRules) ? [...ctx.weaponRules] : [],
    modifiers: { ...(ctx?.modifiers || {}) },
    ui: {
      ...(ctx?.ui || {}),
      notes: Array.isArray(ctx?.ui?.notes) ? [...ctx.ui.notes] : [],
      appliedRules: { ...(ctx?.ui?.appliedRules || {}) },
    },
  };

  const order = String(targetOrder || "").toLowerCase();
  const isEngage = order === "engage";
  const isConceal = order === "conceal";
  const noteId = "vantage-conceal";
  const noteText =
    "Vantage (vs Conceal and cover save is true): you can retain 2 normal saves OR 1 crit save.";

  nextCtx.weaponRules = nextCtx.weaponRules.filter(
    (rule) => !(rule?.id === "accurate" && rule?.source === "vantage"),
  );

  if (isEngage && (distance === 4 || distance === 2)) {
    const accurateValue = distance === 4 ? 2 : 1;
    nextCtx.weaponRules.push({ id: "accurate", value: accurateValue, source: "vantage" });
    nextCtx.modifiers.coverDisabled = true;
    nextCtx.modifiers.coverSelected = false;
  }

  nextCtx.ui.notes = nextCtx.ui.notes.filter((note) => note?.ruleId !== noteId);
  if (isConceal) {
    nextCtx.ui.notes.push({
      target: "defender",
      type: "RULE_NOTE",
      ruleId: noteId,
      text: noteText,
    });
  }

  return nextCtx;
}
