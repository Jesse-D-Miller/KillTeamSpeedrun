// src/engine/rules/vantageRule.js

export function getVantageOptions(targetOrder) {
  const order = String(targetOrder || "").toLowerCase();
  if (order === "engage") return [4, 2];
  return [];
}

export function applyVantage(ctx, { targetOrder, mode, active } = {}) {
  const nextCtx = {
    ...ctx,
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
  const concealNoteId = "vantage-conceal";
  const concealNoteText =
    "Vantage (vs Conceal): you can retain 2 normal saves OR 1 crit save.";
  const engageNoteId = "vantage";
  const engageNoteText =
    "Vantage: you gain Accurate. Apply in Pre-Roll.";

  const prevCoverSelected = nextCtx.modifiers.coverSelected;
  const prevCoverSaved = nextCtx.modifiers.coverWasCheckedBeforeVantage;
  const engageActive =
    isEngage && active && (mode === "4in" || mode === "2in");

  nextCtx.modifiers.vantageState = null;
  nextCtx.modifiers.coverDisabledByVantage = false;

  if (!engageActive && typeof prevCoverSaved === "boolean") {
    nextCtx.modifiers.coverSelected = prevCoverSaved;
    nextCtx.modifiers.coverWasCheckedBeforeVantage = undefined;
  }

  if (engageActive) {
    const accurateValue = mode === "4in" ? 2 : 1;
    nextCtx.modifiers.vantageState = { mode, accurateValue };
    nextCtx.modifiers.coverDisabledByVantage = true;
    nextCtx.modifiers.coverWasCheckedBeforeVantage =
      typeof prevCoverSaved === "boolean" ? prevCoverSaved : Boolean(prevCoverSelected);
    nextCtx.modifiers.coverSelected = false;
  }

  nextCtx.ui.notes = nextCtx.ui.notes.filter(
    (note) => note?.ruleId !== concealNoteId && note?.ruleId !== engageNoteId,
  );
  if (isEngage && (mode === "4in" || mode === "2in") && active) {
    nextCtx.ui.notes.push({
      target: "attacker",
      type: "RULE_NOTE",
      ruleId: engageNoteId,
      text: engageNoteText.replace(
        "Accurate",
        `Accurate ${mode === "4in" ? 2 : 1}`,
      ),
    });
  }
  if (isConceal && active) {
    nextCtx.modifiers.vantageState = { mode: "conceal", accurateValue: 0 };
    nextCtx.ui.notes.push({
      target: "defender",
      type: "RULE_NOTE",
      ruleId: concealNoteId,
      text: concealNoteText,
    });
  }

  return nextCtx;
}
