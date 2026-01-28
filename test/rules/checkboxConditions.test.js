import { expect } from "chai";
import { applyConditionNotes } from "../../src/engine/rules/combatConditions.js";

describe("checkboxConditions", () => {
  it("adds cover note for defender", () => {
    const ctx = applyConditionNotes({ ui: { notes: [], appliedRules: {} } }, { cover: true });
    expect(ctx.ui.notes.some((note) => note.ruleId === "cover")).to.equal(true);
    expect(ctx.ui.appliedRules.cover).to.equal(true);
  });

  it("adds obscured + vantage notes for attacker", () => {
    const ctx = applyConditionNotes({ ui: { notes: [], appliedRules: {} } }, { obscured: true, vantage: true });
    expect(ctx.ui.notes.some((note) => note.ruleId === "obscured")).to.equal(true);
    expect(ctx.ui.notes.some((note) => note.ruleId === "vantage")).to.equal(true);
  });

  it("removes notes when toggled off", () => {
    const initial = applyConditionNotes({ ui: { notes: [], appliedRules: {} } }, { cover: true });
    const next = applyConditionNotes(initial, { cover: false });
    expect(next.ui.notes.some((note) => note.ruleId === "cover")).to.equal(false);
    expect(next.ui.appliedRules.cover).to.equal(false);
  });
});
