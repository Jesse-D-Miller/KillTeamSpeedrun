import { expect } from "chai";
import { applyVantage, getVantageOptions } from "../../src/engine/rules/vantageRule.js";

describe("vantageRule", () => {
  it("getVantageOptions returns engage distances", () => {
    expect(getVantageOptions("engage")).to.deep.equal([4, 2]);
    expect(getVantageOptions("ENGAGE")).to.deep.equal([4, 2]);
  });

  it("getVantageOptions returns [] for conceal", () => {
    expect(getVantageOptions("conceal")).to.deep.equal([]);
  });

  it("applyVantage (engage, 4) sets modifiers and disables cover", () => {
    const ctx = {
      weaponRules: [{ id: "lethal", value: 5 }],
      modifiers: { coverSelected: true },
      ui: { notes: [], appliedRules: {} },
    };

    const next = applyVantage(ctx, { targetOrder: "engage", mode: "4in", active: true });

    expect(next.modifiers.vantageState).to.deep.equal({ mode: "4in", accurateValue: 2 });
    expect(next.modifiers.coverDisabledByVantage).to.equal(true);
    expect(next.modifiers.coverSelected).to.equal(false);
  });

  it("applyVantage (engage, 2) sets modifiers and disables cover", () => {
    const ctx = {
      weaponRules: [],
      modifiers: { coverSelected: true, coverDisabledByVantage: false },
      ui: { notes: [], appliedRules: {} },
    };
    const next = applyVantage(ctx, { targetOrder: "engage", mode: "2in", active: true });

    expect(next.modifiers.vantageState).to.deep.equal({ mode: "2in", accurateValue: 1 });
    expect(next.modifiers.coverDisabledByVantage).to.equal(true);
    expect(next.modifiers.coverSelected).to.equal(false);
  });

  it("applyVantage (conceal) adds defender note only", () => {
    const ctx = {
      weaponRules: [],
      modifiers: { coverSelected: true, coverDisabledByVantage: false },
      ui: { notes: [], appliedRules: {} },
    };
    const next = applyVantage(ctx, { targetOrder: "conceal", active: true });

    expect(next.modifiers.vantageState).to.deep.equal({ mode: "conceal", accurateValue: 0 });
    expect(next.modifiers.coverDisabledByVantage).to.not.equal(true);

    const note = next.ui.notes.find((entry) => entry?.ruleId === "vantage-conceal");
    expect(note).to.exist;
    expect(note.text).to.include("retain 2 normal saves");
    expect(note.text).to.include("OR 1 crit save");
  });

  it("applyVantage (engage) switches accurate without stacking", () => {
    const ctx = {
      weaponRules: [],
      modifiers: { coverSelected: true, coverDisabledByVantage: false },
      ui: { notes: [], appliedRules: {} },
    };

    const afterFour = applyVantage(ctx, { targetOrder: "engage", mode: "4in", active: true });
    const afterTwo = applyVantage(afterFour, { targetOrder: "engage", mode: "2in", active: true });

    expect(afterTwo.modifiers.vantageState).to.deep.equal({ mode: "2in", accurateValue: 1 });
  });
});
