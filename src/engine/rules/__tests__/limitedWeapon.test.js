import { expect } from "chai";
import {
  getLimitedValue,
  canUseLimitedWeapon,
  makeWeaponUsageKey,
} from "../limitedWeapon.js";

describe("limitedWeapon", () => {
  it("parses 'limited 1' from string rules", () => {
    const weapon = { wr: ["balanced", "limited 1"] };
    expect(getLimitedValue(weapon)).to.equal(1);
  });

  it("parses {id:'limited', value:n}", () => {
    const weapon = { wr: [{ id: "limited", value: 2 }] };
    expect(getLimitedValue(weapon)).to.equal(2);
  });

  it("returns null if no limited", () => {
    const weapon = { wr: ["balanced"] };
    expect(getLimitedValue(weapon)).to.equal(null);
  });

  it("canUseLimitedWeapon returns true if no limited", () => {
    const ok = canUseLimitedWeapon({
      weaponProfile: { wr: ["balanced"] },
      operativeId: "u1",
      weaponName: "gun",
      weaponUsage: {},
    });
    expect(ok).to.equal(true);
  });

  it("blocks use when used >= limit", () => {
    const key = makeWeaponUsageKey("u1", "grenade");
    const ok = canUseLimitedWeapon({
      weaponProfile: { wr: ["limited 1"] },
      operativeId: "u1",
      weaponName: "grenade",
      weaponUsage: { [key]: { used: 1, limit: 1 } },
    });
    expect(ok).to.equal(false);
  });

  it("allows use when used < limit", () => {
    const key = makeWeaponUsageKey("u1", "grenade");
    const ok = canUseLimitedWeapon({
      weaponProfile: { wr: ["limited 2"] },
      operativeId: "u1",
      weaponName: "grenade",
      weaponUsage: { [key]: { used: 1, limit: 2 } },
    });
    expect(ok).to.equal(true);
  });
});
