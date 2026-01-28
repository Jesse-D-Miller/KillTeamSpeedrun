// src/engine/rules/vantage.js

const VANTAGE_NOTE_ID = "vantage";
const VANTAGE_CONCEAL_NOTE_ID = "vantage-conceal";
const VANTAGE_CONCEAL_NOTE_TEXT =
  "Vantage (vs Conceal): you can retain 2 normal saves OR 1 crit save.";

const ensureNotes = (ctx) =>
  Array.isArray(ctx?.ui?.notes) ? [...ctx.ui.notes] : [];

const ensureModifiers = (ctx) => ({ ...(ctx?.modifiers || {}) });

export function applyVantageEngage(ctx, distanceInches) {
  const distance = Number(distanceInches);
  if (![2, 4].includes(distance)) return { ...ctx };

  const nextModifiers = ensureModifiers(ctx);
  const prevCoverSelected = nextModifiers.coverSelected;
  const prevCoverSaved = nextModifiers.coverWasCheckedBeforeVantage;

  nextModifiers.vantageState = {
    mode: distance === 4 ? "4in" : "2in",
    accurateValue: distance === 4 ? 2 : 1,
  };
  nextModifiers.coverDisabledByVantage = true;
  nextModifiers.coverWasCheckedBeforeVantage =
    typeof prevCoverSaved === "boolean" ? prevCoverSaved : Boolean(prevCoverSelected);
  nextModifiers.coverSelected = false;

  return {
    ...ctx,
    modifiers: nextModifiers,
  };
}

export function applyVantageConceal(ctx) {
  const nextModifiers = ensureModifiers(ctx);
  const notes = ensureNotes(ctx).filter(
    (note) => note?.ruleId !== VANTAGE_CONCEAL_NOTE_ID,
  );

  nextModifiers.vantageState = { mode: "conceal", accurateValue: 0 };
  notes.push({
    target: "defender",
    type: "RULE_NOTE",
    ruleId: VANTAGE_CONCEAL_NOTE_ID,
    text: VANTAGE_CONCEAL_NOTE_TEXT,
  });

  return {
    ...ctx,
    modifiers: nextModifiers,
    ui: { ...(ctx?.ui || {}), notes },
  };
}

export function clearVantage(ctx) {
  const nextModifiers = ensureModifiers(ctx);
  const notes = ensureNotes(ctx).filter(
    (note) => note?.ruleId !== VANTAGE_NOTE_ID && note?.ruleId !== VANTAGE_CONCEAL_NOTE_ID,
  );

  const prevCoverSaved = nextModifiers.coverWasCheckedBeforeVantage;
  nextModifiers.vantageState = null;
  nextModifiers.coverDisabledByVantage = false;

  if (typeof prevCoverSaved === "boolean") {
    nextModifiers.coverSelected = prevCoverSaved;
    nextModifiers.coverWasCheckedBeforeVantage = undefined;
  }

  return {
    ...ctx,
    modifiers: nextModifiers,
    ui: { ...(ctx?.ui || {}), notes },
  };
}

export function getEffectiveWeaponRules(ctx) {
  const baseRules = Array.isArray(ctx?.weaponRules) ? [...ctx.weaponRules] : [];
  const vantage = ctx?.modifiers?.vantageState;

  if (vantage && (vantage.mode === "4in" || vantage.mode === "2in")) {
    return [
      { id: "accurate", value: Number(vantage.accurateValue), source: "vantage" },
      ...baseRules,
    ];
  }

  return baseRules;
}