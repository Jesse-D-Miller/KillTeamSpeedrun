import { expect } from "chai";
import { getEffectiveWeaponRules } from "../../src/engine/rules/effectiveWeaponRules.js";

describe("effectiveWeaponRules", () => {
  it("prepends accurate rule from vantage", () => {
    const ctx = {
      weaponRules: [{ id: "lethal", value: 5 }],
      modifiers: { vantageState: { mode: "4in", accurateValue: 2 } },
    };

    const result = getEffectiveWeaponRules(ctx);
    expect(result[0]).to.include({ id: "accurate", value: 2, source: "vantage" });
    expect(result[1]).to.include({ id: "lethal", value: 5 });
  });

  it("keeps weapon accurate alongside vantage accurate", () => {
    const ctx = {
      weaponRules: [
        { id: "accurate", value: 1 },
        { id: "lethal", value: 5 },
      ],
      modifiers: { vantageState: { mode: "2in", accurateValue: 1 } },
    };

    const result = getEffectiveWeaponRules(ctx);
    const accurateRules = result.filter((rule) => rule.id === "accurate");
    expect(accurateRules).to.have.lengthOf(2);
    expect(accurateRules[0]).to.include({ id: "accurate", value: 1, source: "vantage" });
  });

  it("returns weapon rules unchanged without vantage", () => {
    const ctx = {
      weaponRules: [{ id: "lethal", value: 5 }],
      modifiers: { vantageState: null },
    };

    const result = getEffectiveWeaponRules(ctx);
    expect(result).to.deep.equal([{ id: "lethal", value: 5 }]);
  });
});
