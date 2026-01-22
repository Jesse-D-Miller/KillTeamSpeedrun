// test/weaponRules.test.js
import { expect } from "chai";

// Adjust this import path to wherever your rules file is:
import { RULES, runWeaponRuleHook, normalizeWeaponRules } from "../src/engine/rules/weaponRules.js";

/**
 * Deterministic dice roller for tests.
 * Usage:
 *   const d6 = makeQueuedD6([6, 2, 5]);
 *   d6() -> 6, then 2, then 5, then throws if called again
 */
function makeQueuedD6(values) {
  const q = [...values];
  return () => {
    if (q.length === 0) throw new Error("rollD6 queue exhausted");
    const v = q.shift();
    if (v < 1 || v > 6) throw new Error(`Invalid d6: ${v}`);
    return v;
  };
}

/**
 * Helper to build a ctx that matches your engine contract.
 */
function makeCtx({
  weapon = { atk: 4, hit: 4 },
  wr = [],
  attackDice = [],
  inputs = {},
  modifiers = {},
  log = [],
} = {}) {
  return {
    weapon,
    weaponRules: wr,
    attackDice,
    inputs,
    modifiers,
    log,
  };
}

/**
 * Helper: count how many dice have a tag
 */
function countTagged(dice, tag) {
  return dice.filter((d) => (d.tags || []).includes(tag)).length;
}

/**
 * Helper: classify dice based on hit and lethal threshold (crit)
 * NOTE: This mirrors the Balanced logic you described:
 * - miss: < hit
 * - hit: >= hit and < critThreshold
 * - crit: >= critThreshold
 */
function classify(value, hit, critThreshold = 6) {
  if (value >= critThreshold) return "crit";
  if (value >= hit) return "hit";
  return "miss";
}

// ---- IMPORTANT TEST SETUP NOTE ----
// Your current rules file uses an internal rollD6() using Math.random.
// For deterministic tests, stub Math.random in a controlled way.
//
// If you refactor later to inject rollD6, you can delete the Math.random stubbing.
function stubMathRandomForD6Sequence(d6values) {
  // d6 = floor(rand*6)+1  => rand = (d6-0.5)/6 gives stable rounding
  const rands = d6values.map((v) => (v - 0.5) / 6);
  let i = 0;
  const original = Math.random;
  Math.random = () => {
    if (i >= rands.length) throw new Error("Math.random stub exhausted");
    return rands[i++];
  };
  return () => {
    Math.random = original;
  };
}

describe("weapon rules engine", () => {
  describe("normalizeWeaponRules()", () => {
    it("returns [] for missing, '-', or empty rules", () => {
      expect(normalizeWeaponRules({ wr: "-" })).to.deep.equal([]);
      expect(normalizeWeaponRules({ wr: [] })).to.deep.equal([]);
      expect(normalizeWeaponRules({})).to.deep.equal([]);
    });

    it("normalizes string rule ids to kebab-case", () => {
      const rules = normalizeWeaponRules({ wr: ["Ceaseless", "Lethal 5+"] });
      expect(rules.map((r) => r.id)).to.deep.equal(["ceaseless", "lethal-5+"]);
      // NOTE: This reveals something important:
      // "lethal 5+" becomes id "lethal-5+" which won't match RULES.lethal.
      // So for tests we will use object form: { id: "lethal", value: 5 }
    });

    it("supports object rules and preserves extra fields", () => {
      const rules = normalizeWeaponRules({ wr: [{ id: "Lethal", value: 5 }] });
      expect(rules[0]).to.include({ id: "lethal", value: 5 });
    });
  });

  describe("Ceaseless", () => {
    it("rerolls the largest group of misses", () => {
      // 3x 2s, 2x 1s, 1x 3, 1x 4, 1x 5; miss on 1-3
      const restore = stubMathRandomForD6Sequence([6, 2, 5]);
      try {
        const ctx = makeCtx({
          weapon: { atk: 8, hit: 4 },
          attackDice: [
            { value: 2, tags: [] },
            { value: 2, tags: [] },
            { value: 2, tags: [] },
            { value: 1, tags: [] },
            { value: 1, tags: [] },
            { value: 3, tags: [] },
            { value: 4, tags: [] },
            { value: 5, tags: [] },
          ],
          wr: [{ id: "ceaseless" }],
        });
        runWeaponRuleHook(ctx, "ON_ROLL_ATTACK");
        // Should reroll 2s (largest group)
        expect(ctx.attackDice.map((d) => d.value.slice ? d.value : d.value)).to.deep.equal([6, 2, 5, 1, 1, 3, 4, 5]);
        expect(countTagged(ctx.attackDice, "rerolled")).to.equal(3);
      } finally {
        restore();
      }
    });

    it("if groups are same size, rerolls the smaller values", () => {
      // 2x 1s, 2x 2s, 1x 3, 1x 4, 1x 5, 1x 6; miss on 1-3
      const restore = stubMathRandomForD6Sequence([4, 5]);
      try {
        const ctx = makeCtx({
          weapon: { atk: 8, hit: 4 },
          attackDice: [
            { value: 1, tags: [] },
            { value: 1, tags: [] },
            { value: 2, tags: [] },
            { value: 2, tags: [] },
            { value: 3, tags: [] },
            { value: 4, tags: [] },
            { value: 5, tags: [] },
            { value: 6, tags: [] },
          ],
          wr: [{ id: "ceaseless" }],
        });
        runWeaponRuleHook(ctx, "ON_ROLL_ATTACK");
        // Should reroll 1s (lowest value among tied largest groups)
        expect(ctx.attackDice.map((d) => d.value)).to.deep.equal([4, 5, 2, 2, 3, 4, 5, 6]);
        expect(countTagged(ctx.attackDice, "rerolled")).to.equal(2);
      } finally {
        restore();
      }
    });

    it("does nothing if no misses", () => {
      const ctx = makeCtx({
        weapon: { atk: 4, hit: 4 },
        attackDice: [
          { value: 4 },
          { value: 5 },
          { value: 6 },
          { value: 6 },
        ],
        wr: [{ id: "ceaseless" }],
      });
      runWeaponRuleHook(ctx, "ON_ROLL_ATTACK");
      expect(ctx.attackDice.map((d) => d.value)).to.deep.equal([4, 5, 6, 6]);
    });
  });

  describe("Lethal X", () => {
    it("sets ctx.modifiers.lethalThreshold on ON_ROLL_ATTACK", () => {
      const ctx = makeCtx({
        attackDice: [{ value: 4 }],
        wr: [{ id: "lethal", value: 5 }],
      });

      runWeaponRuleHook(ctx, "ON_ROLL_ATTACK");

      expect(ctx.modifiers.lethalThreshold).to.equal(5);

      const logEntry = ctx.log.find((l) => l.type === "RULE_LETHAL");
      expect(logEntry).to.exist;
      expect(logEntry.detail.threshold).to.equal(5);
    });

    it("ignores non-numeric lethal values", () => {
      const ctx = makeCtx({
        attackDice: [{ value: 4 }],
        wr: [{ id: "lethal", value: "wat" }],
      });

      runWeaponRuleHook(ctx, "ON_ROLL_ATTACK");
      expect(ctx.modifiers.lethalThreshold).to.equal(undefined);
    });
  });

  // ---- These next two describe Accurate/Balanced behavior based on your new hook contract ----
  // If Accurate/Balanced aren't implemented yet, keep these tests marked .skip until you add them.

  describe("Accurate X", () => {
    it("BEFORE_ROLL_ATTACK reduces ctx.modifiers.attackDiceCount by spent clicks up to X", () => {
      const ctx = makeCtx({
        weapon: { atk: 4, hit: 4 },
        wr: [{ id: "accurate", value: 2 }],
        modifiers: { attackDiceCount: 4 },
        inputs: { accurateSpent: 1 },
      });

      runWeaponRuleHook(ctx, "BEFORE_ROLL_ATTACK");

      expect(ctx.modifiers.attackDiceCount).to.equal(3);
      expect(ctx.modifiers.accurateSpent).to.equal(1);

      const logEntry = ctx.log.find((l) => l.type === "RULE_ACCURATE_BEFORE");
      expect(logEntry).to.exist;
      expect(logEntry.detail.spent).to.equal(1);
    });

    it("AFTER_ROLL_ATTACK injects 'spent' retained hits with value == hit threshold, tagged", () => {
      const ctx = makeCtx({
        weapon: { atk: 4, hit: 4 },
        wr: [{ id: "accurate", value: 2 }],
        modifiers: { accurateSpent: 2 },
        attackDice: [{ value: 2 }, { value: 6 }],
      });

      runWeaponRuleHook(ctx, "AFTER_ROLL_ATTACK");

      // retained dice are prepended in the suggested implementation
      expect(ctx.attackDice.length).to.equal(4);
      expect(ctx.attackDice[0].value).to.equal(4);
      expect(ctx.attackDice[1].value).to.equal(4);

      expect(ctx.attackDice[0].tags).to.include("accurate");
      expect(ctx.attackDice[0].tags).to.include("retained");

      const logEntry = ctx.log.find((l) => l.type === "RULE_ACCURATE_AFTER");
      expect(logEntry).to.exist;
      expect(logEntry.detail.added).to.equal(2);
    });

    it("does not reduce below 0 even if spent > atk", () => {
      const ctx = makeCtx({
        weapon: { atk: 4, hit: 4 },
        wr: [{ id: "accurate", value: 6 }],
        modifiers: { attackDiceCount: 2 },
        inputs: { accurateSpent: 6 },
      });

      runWeaponRuleHook(ctx, "BEFORE_ROLL_ATTACK");

      expect(ctx.modifiers.attackDiceCount).to.equal(0);
      expect(ctx.modifiers.accurateSpent).to.equal(2);
    });
  });

  describe("Balanced", () => {
    it("rerolls the lowest miss; if no misses rerolls lowest hit; if no hits/misses rerolls lowest crit", () => {
      // We need deterministic d6: reroll result will be 6
      const restore = stubMathRandomForD6Sequence([6]);
      try {
        const ctx = makeCtx({
          weapon: { atk: 4, hit: 4 },
          wr: [{ id: "balanced" }],
          inputs: { balancedClick: true },
          modifiers: { lethalThreshold: 6 }, // default crit at 6
          attackDice: [
            { value: 2, tags: [] }, // miss
            { value: 3, tags: [] }, // miss (lowest miss is 2)
            { value: 4, tags: [] }, // hit
            { value: 6, tags: [] }, // crit
          ],
        });

        runWeaponRuleHook(ctx, "ON_BALANCED");

        // lowest miss (2) rerolled to 6
        expect(ctx.attackDice.map((d) => d.value)).to.deep.equal([6, 3, 4, 6]);
        expect(ctx.modifiers.balancedUsed).to.equal(true);
        expect(countTagged(ctx.attackDice, "balanced")).to.equal(1);
        expect(countTagged(ctx.attackDice, "rerolled")).to.equal(1);

        const logEntry = ctx.log.find((l) => l.type === "RULE_BALANCED");
        expect(logEntry).to.exist;
        expect(logEntry.detail.pickedFrom).to.equal("miss");
      } finally {
        restore();
      }
    });

    it("if no misses, rerolls the lowest hit", () => {
      const restore = stubMathRandomForD6Sequence([2]); // reroll result
      try {
        const ctx = makeCtx({
          weapon: { atk: 4, hit: 4 },
          wr: [{ id: "balanced" }],
          inputs: { balancedClick: true },
          modifiers: { lethalThreshold: 6 },
          attackDice: [
            { value: 4, tags: [] }, // hit (lowest hit)
            { value: 5, tags: [] }, // hit
            { value: 6, tags: [] }, // crit
          ],
        });

        runWeaponRuleHook(ctx, "ON_BALANCED");
        expect(ctx.attackDice.map((d) => d.value)).to.deep.equal([2, 5, 6]);
      } finally {
        restore();
      }
    });

    it("if only crits exist, rerolls the lowest crit", () => {
      const restore = stubMathRandomForD6Sequence([1]);
      try {
        const ctx = makeCtx({
          weapon: { atk: 3, hit: 2 },
          wr: [{ id: "balanced" }],
          inputs: { balancedClick: true },
          modifiers: { lethalThreshold: 5 }, // crit at 5+
          attackDice: [
            { value: 5, tags: [] }, // crit (lowest crit)
            { value: 6, tags: [] }, // crit
          ],
        });

        runWeaponRuleHook(ctx, "ON_BALANCED");
        expect(ctx.attackDice.map((d) => d.value)).to.deep.equal([1, 6]);
      } finally {
        restore();
      }
    });

    it("does nothing if button wasn't clicked", () => {
      const ctx = makeCtx({
        weapon: { atk: 4, hit: 4 },
        wr: [{ id: "balanced" }],
        inputs: { balancedClick: false },
        attackDice: [{ value: 2 }, { value: 6 }],
      });

      runWeaponRuleHook(ctx, "ON_BALANCED");
      expect(ctx.attackDice.map((d) => d.value)).to.deep.equal([2, 6]);
    });

    it("only works once per attack (balancedUsed)", () => {
      const restore = stubMathRandomForD6Sequence([6]);
      try {
        const ctx = makeCtx({
          weapon: { atk: 4, hit: 4 },
          wr: [{ id: "balanced" }],
          inputs: { balancedClick: true },
          modifiers: { balancedUsed: true }, // already used
          attackDice: [{ value: 2 }, { value: 6 }],
        });

        runWeaponRuleHook(ctx, "ON_BALANCED");
        expect(ctx.attackDice.map((d) => d.value)).to.deep.equal([2, 6]);
      } finally {
        restore();
      }
    });
  });

  describe("Regression: Ceaseless + Lethal together", () => {
    it("ceaseless rerolls the largest group of misses and lethal sets threshold (both apply on ON_ROLL_ATTACK)", () => {
      // 2x 1s, 2x 2s, 1x 3, 1x 4; miss on 1-3, lethal 5+
      const restore = stubMathRandomForD6Sequence([6, 5]);
      try {
        const ctx = makeCtx({
          weapon: { atk: 6, hit: 4 },
          wr: [{ id: "ceaseless" }, { id: "lethal", value: 5 }],
          attackDice: [
            { value: 1 },
            { value: 1 },
            { value: 2 },
            { value: 2 },
            { value: 3 },
            { value: 4 },
          ],
        });
        runWeaponRuleHook(ctx, "ON_ROLL_ATTACK");
        // Ceaseless: reroll 1s (lowest value among tied largest groups)
        expect(ctx.attackDice.map((d) => d.value)).to.deep.equal([6, 5, 2, 2, 3, 4]);
        // Lethal: sets threshold
        expect(ctx.modifiers.lethalThreshold).to.equal(5);
        expect(ctx.log.some((l) => l.type === "RULE_CEASELESS")).to.equal(true);
        expect(ctx.log.some((l) => l.type === "RULE_LETHAL")).to.equal(true);
      } finally {
        restore();
      }
    });
  });
});
