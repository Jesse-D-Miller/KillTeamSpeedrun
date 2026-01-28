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

  it("applyVantage (engage, 4) adds accurate and disables cover", () => {
    const ctx = {
      weaponRules: [{ id: "lethal", value: 5 }],
      modifiers: { coverSelected: true },
      ui: { notes: [], appliedRules: {} },
    };

    const next = applyVantage(ctx, { targetOrder: "engage", distance: 4 });
    const accurateFromVantage = next.weaponRules.filter(
      (rule) => rule.id === "accurate" && rule.source === "vantage",
    );

    expect(accurateFromVantage).to.have.lengthOf(1);
    expect(accurateFromVantage[0].value).to.equal(2);
    expect(next.modifiers.coverDisabled).to.equal(true);
    expect(next.modifiers.coverSelected).to.equal(false);
  });

  it("applyVantage (engage, 2) adds accurate 1 and disables cover", () => {
    const ctx = {
      weaponRules: [],
      modifiers: { coverSelected: true, coverDisabled: false },
      ui: { notes: [], appliedRules: {} },
    };
    const next = applyVantage(ctx, { targetOrder: "engage", distance: 2 });
    const accurateFromVantage = next.weaponRules.filter(
      (rule) => rule.id === "accurate" && rule.source === "vantage",
    );

    expect(accurateFromVantage).to.have.lengthOf(1);
    expect(accurateFromVantage[0].value).to.equal(1);
    expect(next.modifiers.coverDisabled).to.equal(true);
    expect(next.modifiers.coverSelected).to.equal(false);
  });

  it("applyVantage (conceal) adds defender note only", () => {
    const ctx = {
      weaponRules: [],
      modifiers: { coverSelected: true, coverDisabled: false },
      ui: { notes: [], appliedRules: {} },
    };
    const next = applyVantage(ctx, { targetOrder: "conceal" });

    const accurateFromVantage = next.weaponRules.filter(
      (rule) => rule.id === "accurate" && rule.source === "vantage",
    );
    expect(accurateFromVantage).to.have.lengthOf(0);

    const note = next.ui.notes.find((entry) => entry?.ruleId === "vantage-conceal");
    expect(note).to.exist;
    expect(note.text).to.include("retain 2 normal saves");
    expect(note.text).to.include("OR 1 crit save");

    expect(next.modifiers.coverDisabled).to.not.equal(true);
  });

  it("applyVantage (engage) switches accurate without stacking", () => {
    const ctx = {
      weaponRules: [],
      modifiers: { coverSelected: true, coverDisabled: false },
      ui: { notes: [], appliedRules: {} },
    };

    const afterFour = applyVantage(ctx, { targetOrder: "engage", distance: 4 });
    const afterTwo = applyVantage(afterFour, { targetOrder: "engage", distance: 2 });
    const accurateFromVantage = afterTwo.weaponRules.filter(
      (rule) => rule.id === "accurate" && rule.source === "vantage",
    );

    expect(accurateFromVantage).to.have.lengthOf(1);
    expect(accurateFromVantage[0].value).to.equal(1);
  });
});
