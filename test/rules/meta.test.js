import { expect } from "chai";
import { getRulePhase, getRuleResponsibility, RESPONSIBILITY } from "../../src/engine/rules/weaponRuleMeta.js";

describe("weaponRuleMeta", () => {
  it("maps responsibilities", () => {
    expect(getRuleResponsibility("stun")).to.equal(RESPONSIBILITY.SEMI);
    expect(getRuleResponsibility("hot")).to.equal(RESPONSIBILITY.SEMI);
    expect(getRuleResponsibility("brutal")).to.equal(RESPONSIBILITY.AUTO);
    expect(getRuleResponsibility("lethal")).to.equal(RESPONSIBILITY.AUTO);
    expect(getRuleResponsibility("balanced")).to.equal(RESPONSIBILITY.PLAYER);
  });

  it("maps phases", () => {
    expect(getRulePhase("accurate")).to.equal("PRE_ROLL");
    expect(getRulePhase("lethal")).to.equal("ROLL");
    expect(getRulePhase("stun")).to.equal("POST_ROLL");
  });
});
