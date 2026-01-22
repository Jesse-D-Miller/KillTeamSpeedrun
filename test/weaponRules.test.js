// test/weaponRules.test.js
import { expect } from "chai";

// Adjust this import path to wherever your rules file is:
import {
  RULES,
  runWeaponRuleHook,
  normalizeWeaponRules,
} from "../src/engine/rules/weaponRules.js";

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
  defenseDice = [],
  coverBlocks = [],
  eligibleBlocks = [],
  inputs = {},
  modifiers = {},
  log = [],
} = {}) {
  return {
    weapon,
    weaponRules: wr,
    attackDice,
    defenseDice,
    coverBlocks,
    eligibleBlocks,
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
        expect(ctx.attackDice.map((d) => d.value)).to.deep.equal([
          6, 2, 5, 1, 1, 3, 4, 5,
        ]);
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
        expect(ctx.attackDice.map((d) => d.value)).to.deep.equal([
          4, 5, 2, 2, 3, 4, 5, 6,
        ]);
        expect(countTagged(ctx.attackDice, "rerolled")).to.equal(2);
      } finally {
        restore();
      }
    });

    it("does nothing if no misses", () => {
      const ctx = makeCtx({
        weapon: { atk: 4, hit: 4 },
        attackDice: [{ value: 4 }, { value: 5 }, { value: 6 }, { value: 6 }],
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
        expect(ctx.attackDice.map((d) => d.value)).to.deep.equal([
          6, 5, 2, 2, 3, 4,
        ]);
        // Lethal: sets threshold
        expect(ctx.modifiers.lethalThreshold).to.equal(5);
        expect(ctx.log.some((l) => l.type === "RULE_CEASELESS")).to.equal(true);
        expect(ctx.log.some((l) => l.type === "RULE_LETHAL")).to.equal(true);
      } finally {
        restore();
      }
    });
  });

  describe("Devastating X", () => {
    it("sanity: devastating rule is registered", () => {
      expect(RULES.devastating).to.exist;
      expect(RULES.devastating.hooks).to.have.property("ON_LOCK_IN_ATTACK");
    });

    it("immediately inflicts X damage per retained crit when attack is locked in", () => {
      const ctx = makeCtx({
        weapon: { atk: 4, hit: 4 },
        wr: [{ id: "devastating", value: 3 }],
        inputs: { attackLockedIn: true },
        attackDice: [
          { value: 6, tags: ["retained", "crit"] }, // crit retained
          { value: 6, tags: ["retained", "crit"] }, // crit retained
          { value: 5, tags: ["retained"] }, // hit retained (should not count)
          { value: 2, tags: [] }, // miss
        ],
      });

      // Target state for tests (engine should read/write this)
      ctx.target = { id: "t1", woundsCurrent: 10, woundsMax: 10 };

      // Keep a snapshot to ensure successes aren’t discarded/changed
      const beforeDice = ctx.attackDice.map((d) => ({
        ...d,
        tags: [...(d.tags || [])],
      }));

      runWeaponRuleHook(ctx, "ON_LOCK_IN_ATTACK");

      // 2 retained crits * 3 = 6 damage
      expect(ctx.target.woundsCurrent).to.equal(4);

      // Dice unchanged (devastating does not discard successes)
      expect(ctx.attackDice).to.deep.equal(beforeDice);

      // Log entry exists
      const logEntry = ctx.log.find((l) => l.type === "RULE_DEVASTATING");
      expect(logEntry).to.exist;
      expect(logEntry.detail).to.include({
        x: 3,
        retainedCrits: 2,
        damage: 6,
        woundsBefore: 10,
        woundsAfter: 4,
      });
    });

    it("counts ONLY retained crits (not unretained crits, not hits)", () => {
      const ctx = makeCtx({
        weapon: { atk: 4, hit: 4 },
        wr: [{ id: "devastating", value: 3 }],
        inputs: { attackLockedIn: true },
        attackDice: [
          { value: 6, tags: ["retained", "crit"] }, // counts
          { value: 6, tags: ["crit"] }, // NOT retained, should not count
          { value: 5, tags: ["retained"] }, // hit retained, should not count
          { value: 4, tags: ["retained"] }, // hit retained, should not count
        ],
      });

      ctx.target = { id: "t1", woundsCurrent: 10, woundsMax: 10 };

      runWeaponRuleHook(ctx, "ON_LOCK_IN_ATTACK");

      // Only 1 retained crit => 3 damage
      expect(ctx.target.woundsCurrent).to.equal(7);

      const logEntry = ctx.log.find((l) => l.type === "RULE_DEVASTATING");
      expect(logEntry).to.exist;
      expect(logEntry.detail.retainedCrits).to.equal(1);
      expect(logEntry.detail.damage).to.equal(3);
    });

    it("does nothing if there are no retained crits", () => {
      const ctx = makeCtx({
        weapon: { atk: 4, hit: 4 },
        wr: [{ id: "devastating", value: 2 }],
        inputs: { attackLockedIn: true },
        attackDice: [
          { value: 6, tags: ["crit"] }, // crit but NOT retained
          { value: 5, tags: ["retained"] }, // hit retained
          { value: 4, tags: [] }, // hit (depending on hit threshold) but not tagged retained/crit
        ],
      });

      ctx.target = { id: "t1", woundsCurrent: 10, woundsMax: 10 };

      runWeaponRuleHook(ctx, "ON_LOCK_IN_ATTACK");

      expect(ctx.target.woundsCurrent).to.equal(10);

      // Either no log entry, or a log entry with 0 damage.
      // This asserts the safe version: if an entry exists, damage must be 0.
      const logEntry = ctx.log.find((l) => l.type === "RULE_DEVASTATING");
      if (logEntry) {
        expect(logEntry.detail.damage).to.equal(0);
      }
    });

    it("can kill the target immediately and ends combat early", () => {
      const ctx = makeCtx({
        weapon: { atk: 4, hit: 4 },
        wr: [{ id: "devastating", value: 3 }],
        inputs: { attackLockedIn: true },
        attackDice: [
          { value: 6, tags: ["retained", "crit"] }, // 2 retained crits => 6 dmg
          { value: 6, tags: ["retained", "crit"] },
        ],
      });

      ctx.target = { id: "t1", woundsCurrent: 5, woundsMax: 10 };

      runWeaponRuleHook(ctx, "ON_LOCK_IN_ATTACK");

      // Clamp at 0
      expect(ctx.target.woundsCurrent).to.equal(0);

      // Engine should mark combat ended and target killed in a consistent place
      // (We standardize on ctx.modifiers flags for tests)
      expect(ctx.modifiers.combatEnded).to.equal(true);
      expect(ctx.modifiers.targetKilled).to.equal(true);

      const logEntry = ctx.log.find((l) => l.type === "RULE_DEVASTATING");
      expect(logEntry).to.exist;
      expect(logEntry.detail.killed).to.equal(true);
    });

    it("does not apply twice if the lock-in hook is run again (scoped to this attack)", () => {
      const ctx = makeCtx({
        weapon: { atk: 4, hit: 4 },
        wr: [{ id: "devastating", value: 2 }],
        inputs: { attackLockedIn: true },
        attackDice: [{ value: 6, tags: ["retained", "crit"] }], // 1 retained crit => 2 dmg
        modifiers: {},
      });

      ctx.target = { id: "t1", woundsCurrent: 10, woundsMax: 10 };

      runWeaponRuleHook(ctx, "ON_LOCK_IN_ATTACK");
      expect(ctx.target.woundsCurrent).to.equal(8);

      // Run again (should not double-dip)
      runWeaponRuleHook(ctx, "ON_LOCK_IN_ATTACK");
      expect(ctx.target.woundsCurrent).to.equal(8);

      expect(ctx.modifiers.devastatingApplied).to.equal(true);

      const entries = ctx.log.filter((l) => l.type === "RULE_DEVASTATING");
      expect(entries.length).to.equal(1);
    });

    it("does nothing if attack is not locked in (guarded by input flag)", () => {
      const ctx = makeCtx({
        weapon: { atk: 4, hit: 4 },
        wr: [{ id: "devastating", value: 3 }],
        inputs: { attackLockedIn: false }, // not locked in
        attackDice: [{ value: 6, tags: ["retained", "crit"] }],
      });

      ctx.target = { id: "t1", woundsCurrent: 10, woundsMax: 10 };

      runWeaponRuleHook(ctx, "ON_LOCK_IN_ATTACK");
      expect(ctx.target.woundsCurrent).to.equal(10);

      const logEntry = ctx.log.find((l) => l.type === "RULE_DEVASTATING");
      expect(logEntry).to.not.exist;
    });
  });

  describe("Brutal", () => {
    it("blocks only with crits", () => {
      // Given: Weapon has brutal, defender has normal and crit successes, attacker has retained successes
      const ctx = makeCtx({
        weapon: { atk: 3, hit: 4 },
        wr: [{ id: "brutal" }],
        attackDice: [
          { value: 5, tags: ["retained"] },
          { value: 6, tags: ["retained"] },
        ],
        defenseDice: [
          { value: 5, tags: ["success"] }, // normal success
          { value: 6, tags: ["crit"] }, // crit success
        ],
      });
      // When: resolve blocks (where brutal applies)
      runWeaponRuleHook(ctx, "ON_RESOLVE_BLOCKS");
      // Then: only crits are eligible to block
      expect(ctx.eligibleBlocks.length).to.equal(1);
      expect(ctx.eligibleBlocks[0].value).to.equal(6);
      expect(ctx.eligibleBlocks[0].tags).to.include("crit");
    });

    it("no crits means no blocks", () => {
      // Given: Weapon has brutal, defender has only normal successes, attacker has retained successes
      const ctx = makeCtx({
        weapon: { atk: 2, hit: 4 },
        wr: [{ id: "brutal" }],
        attackDice: [
          { value: 5, tags: ["retained"] },
          { value: 6, tags: ["retained"] },
        ],
        defenseDice: [
          { value: 5, tags: ["success"] }, // normal success
          { value: 5, tags: ["success"] }, // normal success
        ],
      });
      // When: resolve blocks
      runWeaponRuleHook(ctx, "ON_RESOLVE_BLOCKS");
      // Then: no eligible blocks
      expect(ctx.eligibleBlocks).to.deep.equal([]);
      // Attacker's retained dice remain unchanged
      expect(
        ctx.attackDice.filter((d) => d.tags.includes("retained")),
      ).to.have.length(2);
    });

    it("crits still work normally", () => {
      // Given: Weapon has brutal, defender has at least one crit, attacker has hits/crits
      const ctx = makeCtx({
        weapon: { atk: 3, hit: 4 },
        wr: [{ id: "brutal" }],
        attackDice: [
          { value: 5, tags: ["retained"] }, // normal hit
          { value: 6, tags: ["retained", "crit"] }, // crit
        ],
        defenseDice: [
          { value: 6, tags: ["crit"] }, // crit success
        ],
      });
      // When: resolve blocks
      runWeaponRuleHook(ctx, "ON_RESOLVE_BLOCKS");
      // Then: crit block is eligible and can block a hit or crit as per normal rules
      // (Assume engine allows crit to block crit or hit)
      expect(ctx.eligibleBlocks).to.deep.equal([{ value: 6, tags: ["crit"] }]);
      // Optionally, check that attack dice are still present (not canceled yet)
      expect(
        ctx.attackDice.filter((d) => d.tags.includes("retained")),
      ).to.have.length(2);
    });

    it("Brutal applies only to the defender", () => {
      // Given: Weapon has brutal, defender has only normal successes
      const ctx = makeCtx({
        weapon: { atk: 2, hit: 4 },
        wr: [{ id: "brutal" }],
        attackDice: [
          { value: 5, tags: ["retained"] }, // normal hit
          { value: 6, tags: ["retained", "crit"] }, // crit
        ],
        defenseDice: [
          { value: 5, tags: ["success"] }, // normal success
        ],
      });
      // When: resolve blocks
      runWeaponRuleHook(ctx, "ON_RESOLVE_BLOCKS");
      // Then: defender's eligible blocks is empty
      expect(ctx.eligibleBlocks).to.deep.equal([]);
      // Attacker's dice are unchanged (no accidental filtering)
      expect(ctx.attackDice).to.deep.equal([
        { value: 5, tags: ["retained"] },
        { value: 6, tags: ["retained", "crit"] },
      ]);
    });

    it("Brutal is scoped to this attack only", () => {
      // First attack: with brutal
      const ctx1 = makeCtx({
        weapon: { atk: 2, hit: 4 },
        wr: [{ id: "brutal" }],
        attackDice: [
          { value: 5, tags: ["retained"] },
          { value: 6, tags: ["retained", "crit"] },
        ],
        defenseDice: [
          { value: 5, tags: ["success"] }, // normal success
          { value: 6, tags: ["crit"] }, // crit success
        ],
      });
      runWeaponRuleHook(ctx1, "ON_RESOLVE_BLOCKS");
      // Only crit block allowed
      expect(ctx1.eligibleBlocks).to.deep.equal([{ value: 6, tags: ["crit"] }]);

      // Second attack: WITHOUT brutal
      const ctx2 = makeCtx({
        weapon: { atk: 2, hit: 4 },
        wr: [], // no brutal
        attackDice: [
          { value: 5, tags: ["retained"] },
          { value: 6, tags: ["retained", "crit"] },
        ],
        // Pretend your core engine already built eligible blocks
        eligibleBlocks: [
          { value: 5, tags: ["success"] },
          { value: 6, tags: ["crit"] },
        ],
      });

      runWeaponRuleHook(ctx2, "ON_RESOLVE_BLOCKS");

      // No brutal => engine should not change eligibleBlocks
      expect(ctx2.eligibleBlocks).to.deep.equal([
        { value: 5, tags: ["success"] },
        { value: 6, tags: ["crit"] },
      ]);
    });

    it("Brutal + Ceaseless does not interfere", () => {
      // Given: Weapon has brutal and ceaseless, defender has normal and crit, attacker has misses
      const ctx = makeCtx({
        weapon: { atk: 4, hit: 4 },
        wr: [{ id: "brutal" }, { id: "ceaseless" }],
        attackDice: [
          { value: 1, tags: [] }, // miss (should be rerolled by ceaseless)
          { value: 2, tags: [] }, // miss (should be rerolled by ceaseless)
          { value: 5, tags: ["retained"] }, // hit
          { value: 6, tags: ["retained", "crit"] }, // crit
        ],
        defenseDice: [
          { value: 5, tags: ["success"] }, // normal success
          { value: 6, tags: ["crit"] }, // crit success
        ],
      });
      // When: reroll misses (ceaseless), then resolve blocks (brutal)
      runWeaponRuleHook(ctx, "ON_ROLL_ATTACK");
      runWeaponRuleHook(ctx, "ON_RESOLVE_BLOCKS");
      // Then: ceaseless rerolled misses (simulate rerolled values)
      // (We can't check reroll result without stubbing, but can check tags)
      expect(
        ctx.attackDice.filter((d) => d.tags.includes("rerolled")).length,
      ).to.be.at.least(1);
      // Brutal: only crit block allowed
      expect(ctx.eligibleBlocks).to.deep.equal([{ value: 6, tags: ["crit"] }]);
    });

    it("Cover saves are NOT blocked by Brutal (if cover is not a 'block die')", () => {
      // Given: Weapon has brutal, defender is in cover (cover grants auto-retain), no defense crits
      const ctx = makeCtx({
        weapon: { atk: 2, hit: 4 },
        wr: [{ id: "brutal" }],
        attackDice: [
          { value: 5, tags: ["retained"] },
          { value: 6, tags: ["retained", "crit"] },
        ],
        defenseDice: [
          { value: 5, tags: ["success"] }, // normal success
        ],
        coverBlocks: [{ source: "cover" }],
      });
      // When: resolve blocks (cover applies, then brutal)
      runWeaponRuleHook(ctx, "ON_RESOLVE_BLOCKS");
      // Then: cover effect still applies (simulate as a separate eligible block)
      // Normal defense die is not eligible, but cover is
      expect(ctx.eligibleBlocks).to.deep.equal([{ source: "cover" }]);
    });

    it("Brutal logs what it changed", () => {
      // Given: Weapon has brutal, defender has normal and crit successes
      const ctx = makeCtx({
        weapon: { atk: 3, hit: 4 },
        wr: [{ id: "brutal" }],
        attackDice: [
          { value: 5, tags: ["retained"] },
          { value: 6, tags: ["retained"] },
        ],
        defenseDice: [
          { value: 5, tags: ["success"] }, // normal success
          { value: 6, tags: ["crit"] }, // crit success
        ],
      });
      // When: resolve blocks (where brutal applies)
      runWeaponRuleHook(ctx, "ON_RESOLVE_BLOCKS");
      // Then: log entry exists
      const logEntry = ctx.log.find((l) => l.type === "RULE_BRUTAL");
      expect(logEntry).to.exist;
      expect(logEntry.detail).to.include.keys([
        "removedNormalBlocks",
        "remainingCritBlocks",
      ]);
      expect(logEntry.detail.removedNormalBlocks).to.equal(1);
      expect(logEntry.detail.remainingCritBlocks).to.equal(1);
    });
  });
});
