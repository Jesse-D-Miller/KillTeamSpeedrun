import { expect } from "chai";
import { clickWeaponRule } from "../../src/engine/rules/weaponRuleUi.js";
import { getClickableWeaponRulesForPhase } from "../../src/engine/rules/weaponRuleUi.js";
import { shouldOpenHotModal } from "../../src/engine/rules/hotResolution.js";

const makeCtx = (overrides = {}) => ({
  phase: "POST_ROLL",
  weaponRules: [],
  ui: { prompts: [], notes: [], appliedRules: {} },
  effects: { attacker: [], defender: [] },
  inputs: { role: "attacker", attackCrits: 1 },
  log: [],
  modifiers: {},
  ...overrides,
});

describe("semiEffects", () => {
  it("stun click adds stunned effect", () => {
    const ctx = makeCtx();
    clickWeaponRule(ctx, { id: "stun" }, {});
    const effect = ctx.effects.defender.find((e) => e.id === "stunned");
    expect(effect).to.exist;
    expect(effect.target).to.equal("defender");
    expect(effect.detail).to.deep.equal({ aplMod: -1 });
    expect(effect.expires).to.deep.equal({ type: "end_next_activation" });
  });

  it("hot click adds hot effect", () => {
    const ctx = makeCtx();
    clickWeaponRule(ctx, { id: "hot" }, {});
    const effect = ctx.effects.attacker.find((e) => e.id === "hot");
    expect(effect).to.exist;
    expect(effect.detail).to.deep.equal({ pending: true });
  });

  it("shock click adds shock effect and note", () => {
    const ctx = makeCtx();
    clickWeaponRule(ctx, { id: "shock" }, {});
    const effect = ctx.effects.defender.find((e) => e.id === "shock");
    expect(effect).to.exist;
    expect(effect.detail).to.deep.equal({ discardPriority: ["normalSuccess", "crit"] });
    expect(ctx.ui.notes.some((n) => n.ruleId === "shock")).to.equal(true);
  });

  it("piercing crits click adds defender effect", () => {
    const ctx = makeCtx();
    clickWeaponRule(ctx, { id: "piercing-crits", value: 2 }, {});
    const effect = ctx.effects.defender.find((e) => e.id === "piercing-crits");
    expect(effect).to.exist;
    expect(effect.detail).to.deep.equal({ reduceDefenseDiceBy: 2 });
  });

  it("piercing crits is disabled without a crit", () => {
    const ctx = makeCtx({ inputs: { role: "attacker", attackCrits: 0 } });
    const items = getClickableWeaponRulesForPhase(
      { ...ctx, weaponRules: [{ id: "piercing-crits", value: 2 }] },
      "POST_ROLL",
    );
    expect(items).to.have.lengthOf(1);
    expect(items[0].enabled).to.equal(false);
  });

  it("hot pending triggers modal flag", () => {
    const ctx = makeCtx();
    clickWeaponRule(ctx, { id: "hot" }, {});
    expect(shouldOpenHotModal(ctx)).to.equal(true);
  });
});
