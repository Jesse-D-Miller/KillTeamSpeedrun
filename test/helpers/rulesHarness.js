import { expect } from "chai";
import {
  applyWeaponRules,
  clickWeaponRule,
  createRulesEngine,
} from "../../src/engine/rules/weaponRules.js";

export const makeCtx = (overrides = {}) => {
  const defaults = {
    phase: "PRE_ROLL",
    weapon: { hit: 4, atk: 4, wr: [] },
    weaponRules: [],
    attacker: { id: "attacker", woundsCurrent: 10 },
    defender: { id: "defender", woundsCurrent: 10 },
    target: { id: "target", woundsCurrent: 10, woundsMax: 10 },
    attackDice: [],
    defenseDice: [],
    coverBlocks: [],
    eligibleBlocks: [],
    inputs: {},
    modifiers: {},
    ui: {
      prompts: [],
      banners: [],
      suggestedInputs: {},
      disabledOptions: {},
      notes: [],
      appliedRules: {},
      availableRules: {},
    },
    effects: { attacker: [], defender: [] },
    log: [],
  };

  const weaponRules =
    overrides.weaponRules || overrides.wr || overrides.weapon?.wr || [];
  return {
    ...defaults,
    ...overrides,
    weapon: { ...defaults.weapon, ...(overrides.weapon || {}) },
    weaponRules,
    ui: {
      ...defaults.ui,
      ...(overrides.ui || {}),
      prompts: [...(overrides.ui?.prompts || [])],
      banners: [...(overrides.ui?.banners || [])],
      notes: [...(overrides.ui?.notes || [])],
      suggestedInputs: { ...(overrides.ui?.suggestedInputs || {}) },
      disabledOptions: { ...(overrides.ui?.disabledOptions || {}) },
      appliedRules: { ...(overrides.ui?.appliedRules || {}) },
      availableRules: { ...(overrides.ui?.availableRules || {}) },
    },
    effects: overrides.effects || { attacker: [], defender: [] },
    modifiers: { ...(overrides.modifiers || {}) },
    inputs: { ...(overrides.inputs || {}) },
    log: [...(overrides.log || [])],
  };
};

export const makeEngine = ({ rollD6 } = {}) => createRulesEngine({ rollD6 });

export const applyPhase = (engine, ctx, phase) => {
  const nextPhase = phase || ctx.phase;
  applyWeaponRules(ctx, nextPhase);
  const prompts = ctx.ui?.prompts || [];
  const available = prompts
    .filter((prompt) => prompt.phase === nextPhase)
    .map((prompt) => prompt.ruleId);
  if (!ctx.ui.availableRules) ctx.ui.availableRules = {};
  ctx.ui.availableRules[nextPhase] = Array.from(new Set(available));
  return ctx;
};

export const clickRule = (engine, ctx, ruleId, phase, payload = {}) => {
  const nextPhase = phase || ctx.phase;
  return clickWeaponRule(ctx, ruleId, nextPhase, payload);
};

export const expectPrompt = (ctx, { type, containsText, phase } = {}) => {
  const prompts = ctx.ui?.prompts || [];
  const found = prompts.find((prompt) => {
    if (type && prompt.ruleId !== type) return false;
    if (phase && prompt.phase !== phase) return false;
    if (containsText && !prompt.text?.includes(containsText)) return false;
    return true;
  });
  expect(found, `Expected prompt for ${type || "rule"}`).to.exist;
  return found;
};

export const expectLogged = (ctx, type) => {
  const found = (ctx.log || []).find((entry) => entry.type === type);
  expect(found, `Expected log entry ${type}`).to.exist;
  return found;
};

export const expectModifier = (ctx, key, value) => {
  expect(ctx.modifiers?.[key], `Expected modifier ${key}`).to.deep.equal(value);
};

export const expectDisabled = (ctx, optionKey, value = true) => {
  expect(ctx.ui?.disabledOptions?.[optionKey]).to.equal(value);
};

export const expectSuggested = (ctx, inputKey, value) => {
  expect(ctx.ui?.suggestedInputs?.[inputKey]).to.deep.equal(value);
};
