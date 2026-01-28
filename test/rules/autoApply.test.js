import { expect } from "chai";
import { applyAutoRulesForPhase } from "../../src/engine/rules/weaponRuleUi.js";

const makeCtx = (overrides = {}) => ({
  phase: "POST_ROLL",
  weaponRules: [{ id: "brutal" }],
  ui: { prompts: [], notes: [], appliedRules: {} },
  effects: { attacker: [], defender: [] },
  log: [],
  ...overrides,
});

describe("autoApply", () => {
  it("adds brutal defender note and marks applied", () => {
    const ctx = makeCtx();
    const first = applyAutoRulesForPhase(ctx, "POST_ROLL");
    expect(first.ctx.ui.notes).to.have.lengthOf(1);
    expect(first.ctx.ui.notes[0].text).to.include("only block with crits");
    expect(first.ctx.ui.appliedRules.brutal).to.equal(true);
  });

  it("dedupes brutal note", () => {
    const ctx = makeCtx({
      ui: {
        prompts: [],
        notes: [
          {
            target: "defender",
            type: "RULE_NOTE",
            ruleId: "brutal",
            text: "Brutal: you can only block with crits.",
          },
        ],
        appliedRules: {},
      },
    });

    const next = applyAutoRulesForPhase(ctx, "POST_ROLL");
    const brutalNotes = next.ctx.ui.notes.filter((note) => note.ruleId === "brutal");
    expect(brutalNotes).to.have.lengthOf(1);
    expect(next.ctx.ui.appliedRules.brutal).to.equal(true);
  });
});
