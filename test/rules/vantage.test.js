import { expect } from "chai";
import {
  applyVantageEngage,
  applyVantageConceal,
  clearVantage,
  getEffectiveWeaponRules,
} from "../../src/engine/rules/vantage.js";

describe("vantage (pure)", () => {
  it("getEffectiveWeaponRules returns Accurate 2/1 when modifier set", () => {
    const ctx4 = { modifiers: { vantageState: { mode: "4in", accurateValue: 2 } } };
    const ctx2 = { modifiers: { vantageState: { mode: "2in", accurateValue: 1 } } };

    const rules4 = getEffectiveWeaponRules(ctx4);
    const rules2 = getEffectiveWeaponRules(ctx2);

    expect(rules4[0]).to.include({ id: "accurate", value: 2, source: "vantage" });
    expect(rules2[0]).to.include({ id: "accurate", value: 1, source: "vantage" });
  });

  it("clearVantage removes modifier so accurate no longer included", () => {
    const ctx = {
      weaponRules: [{ id: "lethal", value: 5 }],
      modifiers: { vantageState: { mode: "4in", accurateValue: 2 } },
    };
    const cleared = clearVantage(ctx);
    const rules = getEffectiveWeaponRules(cleared);

    expect(cleared.modifiers.vantageState).to.equal(null);
    expect(
      rules.some((rule) => rule.id === "accurate" && rule.source === "vantage"),
    ).to.equal(false);
  });

  it("coverDisabled flag toggles appropriately", () => {
    const ctx = {
      modifiers: { coverSelected: true },
      ui: { notes: [] },
    };
    const applied = applyVantageEngage(ctx, 4);
    expect(applied.modifiers.coverDisabledByVantage).to.equal(true);
    expect(applied.modifiers.coverSelected).to.equal(false);

    const cleared = clearVantage(applied);
    expect(cleared.modifiers.coverDisabledByVantage).to.equal(false);
    expect(cleared.modifiers.coverSelected).to.equal(true);
  });

  it("applyVantageConceal adds defender note and no accurate", () => {
    const ctx = { weaponRules: [], modifiers: {}, ui: { notes: [] } };
    const next = applyVantageConceal(ctx);

    expect(next.modifiers.vantageState).to.deep.equal({ mode: "conceal", accurateValue: 0 });
    expect(next.ui.notes.some((note) => note.ruleId === "vantage-conceal")).to.equal(true);
  });
});