import { expect } from "chai";
import { getEffectiveWeaponRules } from "../../src/engine/rules/effectiveWeaponRules.js";

describe("getEffectiveWeaponRules", () => {
  it("returns base rules when no vantageState", () => {
    const ctx = {
      weaponRules: [{ id: "balanced" }, { id: "lethal", value: 5 }],
      modifiers: {},
    };

    const rules = getEffectiveWeaponRules(ctx);

    expect(rules).to.deep.equal([{ id: "balanced" }, { id: "lethal", value: 5 }]);
  });

  it("adds Accurate 2 (source=vantage) when vantageState.mode is 4in", () => {
    const ctx = {
      weaponRules: [{ id: "balanced" }],
      modifiers: { vantageState: { mode: "4in", accurateValue: 2 } },
      inputs: { role: "attacker" },
    };

    const rules = getEffectiveWeaponRules(ctx);

    expect(rules[0]).to.deep.equal({
      id: "accurate",
      value: 2,
      source: "vantage",
    });
    expect(rules.slice(1)).to.deep.equal([{ id: "balanced" }]);
  });

  it("adds Accurate 1 (source=vantage) when vantageState.mode is 2in", () => {
    const ctx = {
      weaponRules: [{ id: "lethal", value: 5 }],
      modifiers: { vantageState: { mode: "2in", accurateValue: 1 } },
      inputs: { role: "attacker" },
    };

    const rules = getEffectiveWeaponRules(ctx);

    expect(rules[0]).to.deep.equal({
      id: "accurate",
      value: 1,
      source: "vantage",
    });
    expect(rules.slice(1)).to.deep.equal([{ id: "lethal", value: 5 }]);
  });

  it("ignores vantageState if mode is not 2in/4in", () => {
    const ctx = {
      weaponRules: [{ id: "balanced" }],
      modifiers: { vantageState: { mode: "weird", accurateValue: 999 } },
    };

    const rules = getEffectiveWeaponRules(ctx);

    expect(rules).to.deep.equal([{ id: "balanced" }]);
  });

  it("coerces accurateValue to Number", () => {
    const ctx = {
      weaponRules: [],
      modifiers: { vantageState: { mode: "4in", accurateValue: "2" } },
      inputs: { role: "attacker" },
    };

    const rules = getEffectiveWeaponRules(ctx);

    expect(rules[0]).to.deep.equal({
      id: "accurate",
      value: 2,
      source: "vantage",
    });
  });

  it("handles missing ctx safely", () => {
    expect(getEffectiveWeaponRules(null)).to.deep.equal([]);
    expect(getEffectiveWeaponRules(undefined)).to.deep.equal([]);
  });
});
