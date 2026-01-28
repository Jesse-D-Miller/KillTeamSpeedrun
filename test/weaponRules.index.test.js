import { expect } from "chai";
import { RULES } from "../src/engine/rules/weaponRules.js";

const ALL_WR = [
  "accurate",
  "balanced",
  "blast",
  "brutal",
  "ceaseless",
  "devastating",
  "heavy",
  "hot",
  "lethal",
  "limited",
  "piercing",
  "piercing-crits",
  "punishing",
  "range",
  "relentless",
  "rending",
  "saturate",
  "seek",
  "severe",
  "shock",
  "silent",
  "stun",
  "torrent",
];

describe("weapon rules index", () => {
  it("registers every supported weapon rule", () => {
    ALL_WR.forEach((ruleId) => {
      expect(RULES[ruleId], `Missing RULES entry for ${ruleId}`).to.exist;
    });
  });

  it("declares uiLabel and phases for every rule", () => {
    ALL_WR.forEach((ruleId) => {
      const rule = RULES[ruleId];
      expect(rule.uiLabel, `${ruleId} missing uiLabel`).to.be.a("string");
      expect(rule.uiLabel.length, `${ruleId} uiLabel empty`).to.be.greaterThan(0);
      expect(rule.phases, `${ruleId} missing phases`).to.be.an("array");
      expect(rule.phases.length, `${ruleId} phases empty`).to.be.greaterThan(0);
      rule.phases.forEach((phase) => {
        expect(phase, `${ruleId} has invalid phase`).to.be.a("string");
      });
    });
  });

  it("implements at least one behavior hook", () => {
    ALL_WR.forEach((ruleId) => {
      const rule = RULES[ruleId];
      const hasBehavior =
        typeof rule.getUiHints === "function" ||
        typeof rule.onClick === "function" ||
        typeof rule.apply === "function";
      expect(hasBehavior, `${ruleId} missing behavior hooks`).to.equal(true);
    });
  });
});
