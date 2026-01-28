// test/weaponRules.test.js
import { expect } from "chai";
import {
  applyPhase,
  clickRule,
  expectDisabled,
  expectLogged,
  expectPrompt,
  expectSuggested,
  makeCtx,
  makeEngine,
} from "./helpers/rulesHarness.js";
import { normalizeWeaponRules } from "../src/engine/rules/weaponRules.js";

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
    it("appears in ROLL phase and is enabled with misses", () => {
      const engine = makeEngine();
      const ctx = makeCtx({
        weapon: { atk: 4, hit: 4 },
        attackDice: [{ value: 1 }, { value: 2 }, { value: 4 }],
        wr: [{ id: "ceaseless" }],
      });

      applyPhase(engine, ctx, "ROLL");

      expect(ctx.ui.availableRules.ROLL).to.include("ceaseless");
      const prompt = expectPrompt(ctx, { type: "ceaseless", phase: "ROLL" });
      expect(prompt.enabled).to.equal(true);
      expectSuggested(ctx, "ceaselessGroupValue", 1);
    });

    it("is disabled when there are no misses", () => {
      const engine = makeEngine();
      const ctx = makeCtx({
        weapon: { atk: 4, hit: 4 },
        attackDice: [{ value: 4 }, { value: 5 }, { value: 6 }],
        wr: [{ id: "ceaseless" }],
      });

      applyPhase(engine, ctx, "ROLL");

      expect(ctx.ui.availableRules.ROLL).to.include("ceaseless");
      const prompt = expectPrompt(ctx, { type: "ceaseless", phase: "ROLL" });
      expect(prompt.enabled).to.equal(false);
    });

    it("click logs and records reroll group value", () => {
      const engine = makeEngine();
      const ctx = makeCtx({
        weapon: { atk: 4, hit: 4 },
        attackDice: [{ value: 1 }, { value: 1 }, { value: 3 }, { value: 4 }],
        wr: [{ id: "ceaseless" }],
      });

      clickRule(engine, ctx, "ceaseless", "ROLL", { ceaselessGroupValue: 1 });

      expect(ctx.modifiers.ceaselessUsed).to.equal(true);
      expectSuggested(ctx, "ceaselessGroupValue", 1);
      const logEntry = expectLogged(ctx, "RULE_CEASELESS_CLICK");
      expect(logEntry.detail.value).to.equal(1);
    });
  });

  describe("Lethal X", () => {
    it("applies in ROLL phase and logs threshold", () => {
      const engine = makeEngine();
      const ctx = makeCtx({
        attackDice: [{ value: 4 }],
        wr: [{ id: "lethal", value: 5 }],
      });

      applyPhase(engine, ctx, "ROLL");

      expect(ctx.modifiers.lethalThreshold).to.equal(5);
      expect(ctx.ui.availableRules.ROLL).to.include("lethal");
      expectPrompt(ctx, { type: "lethal", phase: "ROLL" });
      const logEntry = expectLogged(ctx, "RULE_LETHAL_APPLY");
      expect(logEntry.detail.threshold).to.equal(5);
    });

    it("ignores non-numeric lethal values", () => {
      const engine = makeEngine();
      const ctx = makeCtx({
        attackDice: [{ value: 4 }],
        wr: [{ id: "lethal", value: "wat" }],
      });

      applyPhase(engine, ctx, "ROLL");
      expect(ctx.modifiers.lethalThreshold).to.equal(undefined);
      const prompts = ctx.ui?.prompts || [];
      expect(prompts.find((prompt) => prompt.ruleId === "lethal")).to.equal(
        undefined,
      );
    });
  });

  // ---- These next two describe Accurate/Balanced behavior based on your new hook contract ----
  // If Accurate/Balanced aren't implemented yet, keep these tests marked .skip until you add them.

  describe("Accurate X", () => {
    it("appears in PRE_ROLL and suggests max spend", () => {
      const engine = makeEngine();
      const ctx = makeCtx({
        weapon: { atk: 4, hit: 4 },
        wr: [{ id: "accurate", value: 2 }],
      });

      applyPhase(engine, ctx, "PRE_ROLL");

      expect(ctx.ui.availableRules.PRE_ROLL).to.include("accurate");
      expectPrompt(ctx, { type: "accurate", phase: "PRE_ROLL" });
      expectSuggested(ctx, "accurateSpentRange", { min: 0, max: 2 });
    });

    it("click sets spend and suggests dice count delta", () => {
      const engine = makeEngine();
      const ctx = makeCtx({
        weapon: { atk: 4, hit: 4 },
        wr: [{ id: "accurate", value: 2 }],
      });

      clickRule(engine, ctx, "accurate", "PRE_ROLL", { accurateSpent: 2 });

      expect(ctx.modifiers.accurateSpent).to.equal(2);
      expectSuggested(ctx, "attackDiceCountDelta", -2);
      const logEntry = expectLogged(ctx, "RULE_ACCURATE_CLICK");
      expect(logEntry.detail.spent).to.equal(2);
      const prompt = expectPrompt(ctx, { type: "accurate", phase: "PRE_ROLL" });
      expect(prompt.steps).to.deep.equal([
        "Roll 2 dice.",
        "Treat 2 dice as retained hits.",
      ]);
    });

    it("POST_ROLL suggests retained hits based on spend", () => {
      const engine = makeEngine();
      const ctx = makeCtx({
        weapon: { atk: 4, hit: 4 },
        wr: [{ id: "accurate", value: 2 }],
        modifiers: { accurateSpent: 1 },
      });

      applyPhase(engine, ctx, "POST_ROLL");

      expect(ctx.ui.availableRules.POST_ROLL).to.include("accurate");
      expectSuggested(ctx, "retainHits", 1);
    });
  });

  describe("Balanced", () => {
    it("appears in ROLL phase and is enabled once per attack", () => {
      const engine = makeEngine();
      const ctx = makeCtx({
        weapon: { atk: 4, hit: 4 },
        wr: [{ id: "balanced" }],
        attackDice: [{ value: 2 }, { value: 6 }],
      });

      applyPhase(engine, ctx, "ROLL");

      expect(ctx.ui.availableRules.ROLL).to.include("balanced");
      const prompt = expectPrompt(ctx, { type: "balanced", phase: "ROLL" });
      expect(prompt.enabled).to.equal(true);
    });

    it("is disabled when already used", () => {
      const engine = makeEngine();
      const ctx = makeCtx({
        weapon: { atk: 4, hit: 4 },
        wr: [{ id: "balanced" }],
        attackDice: [{ value: 2 }, { value: 6 }],
        modifiers: { balancedUsed: true },
      });

      applyPhase(engine, ctx, "ROLL");

      const prompt = expectPrompt(ctx, { type: "balanced", phase: "ROLL" });
      expect(prompt.enabled).to.equal(false);
    });

    it("click sets balancedUsed and logs instruction", () => {
      const engine = makeEngine();
      const ctx = makeCtx({
        weapon: { atk: 4, hit: 4 },
        wr: [{ id: "balanced" }],
        attackDice: [{ value: 2 }, { value: 6 }],
      });

      clickRule(engine, ctx, "balanced", "ROLL", {});

      expect(ctx.modifiers.balancedUsed).to.equal(true);
      const prompt = expectPrompt(ctx, { type: "balanced", phase: "ROLL" });
      expect(prompt.steps).to.deep.equal([
        "Reroll one attack die (recommend: lowest miss, then lowest hit, then lowest crit).",
      ]);
      const logEntry = expectLogged(ctx, "RULE_BALANCED_CLICK");
      expect(logEntry.detail.recommendation).to.deep.equal({
        value: 2,
        type: "miss",
      });
    });
  });

  describe("Regression: Ceaseless + Lethal together", () => {
    it("both appear in ROLL phase and set suggestions", () => {
      const engine = makeEngine();
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

      applyPhase(engine, ctx, "ROLL");

      expect(ctx.ui.availableRules.ROLL).to.include("ceaseless");
      expect(ctx.ui.availableRules.ROLL).to.include("lethal");
      expectPrompt(ctx, { type: "ceaseless", phase: "ROLL" });
      expectPrompt(ctx, { type: "lethal", phase: "ROLL" });
      expect(ctx.modifiers.lethalThreshold).to.equal(5);
      expectSuggested(ctx, "ceaselessGroupValue", 1);
    });
  });

  describe("Devastating X", () => {
    it("appears in LOCK_IN and suggests damage per retained crit", () => {
      const engine = makeEngine();
      const ctx = makeCtx({
        weapon: { atk: 4, hit: 4 },
        wr: [{ id: "devastating", value: 3 }],
      });

      applyPhase(engine, ctx, "LOCK_IN");

      expect(ctx.ui.availableRules.LOCK_IN).to.include("devastating");
      expectPrompt(ctx, { type: "devastating", phase: "LOCK_IN" });
      expectSuggested(ctx, "devastatingDamagePerCrit", 3);
    });

    it("click logs damage recommendation and flags applied", () => {
      const engine = makeEngine();
      const ctx = makeCtx({
        weapon: { atk: 4, hit: 4 },
        wr: [{ id: "devastating", value: 3 }],
      });

      clickRule(engine, ctx, "devastating", "LOCK_IN", { retainedCrits: 2 });

      expectSuggested(ctx, "applyDamage", 6);
      expect(ctx.modifiers.devastatingApplied).to.equal(true);
      const logEntry = expectLogged(ctx, "RULE_DEVASTATING_CLICK");
      expect(logEntry.detail.damage).to.equal(6);
    });
  });

  describe("Brutal", () => {
    it("disables normal block options and logs counts", () => {
      const engine = makeEngine();
      const ctx = makeCtx({
        weapon: { atk: 3, hit: 4 },
        wr: [{ id: "brutal" }],
        defenseDice: [
          { value: 5, tags: ["success"] },
          { value: 6, tags: ["crit"] },
        ],
      });

      applyPhase(engine, ctx, "RESOLVE_BLOCKS");

      expect(ctx.ui.availableRules.RESOLVE_BLOCKS).to.include("brutal");
      expectPrompt(ctx, { type: "brutal", phase: "RESOLVE_BLOCKS" });
      expectDisabled(ctx, "defenseBlocks", "normal");
      const logEntry = expectLogged(ctx, "RULE_BRUTAL");
      expect(logEntry.detail.removedNormalBlocks).to.equal(1);
      expect(logEntry.detail.remainingCritBlocks).to.equal(1);
    });
  });

  describe("Blast", () => {
    it("builds attack queue in PRE_ROLL and suggests secondary target limit", () => {
      const engine = makeEngine();
      const ctx = makeCtx({
        wr: [{ id: "blast", value: 2 }],
        inputs: {
          primaryTargetId: "t1",
          secondaryTargetIds: ["t2", "t1", "t3"],
        },
      });

      applyPhase(engine, ctx, "PRE_ROLL");

      expect(ctx.ui.availableRules.PRE_ROLL).to.include("blast");
      const prompt = expectPrompt(ctx, { type: "blast", phase: "PRE_ROLL" });
      expect(prompt.steps[0]).to.equal("Resolve attacks against: t1, t2, t3.");
      expectSuggested(ctx, "maxSecondaryTargets", 2);
      expect(ctx.attackQueue).to.have.length(3);
    });

    it("dedupes secondary targets when building queue", () => {
      const engine = makeEngine();
      const ctx = makeCtx({
        wr: [{ id: "blast", value: 2 }],
        inputs: {
          primaryTargetId: "t1",
          secondaryTargetIds: ["t2", "t1", "t2", "t3"],
        },
      });

      applyPhase(engine, ctx, "PRE_ROLL");

      expect(ctx.attackQueue).to.have.length(3);
      expect(ctx.attackQueue.map((item) => item.targetId)).to.deep.equal([
        "t1",
        "t2",
        "t3",
      ]);
    });

    it("secondary attack items ignore conceal and inherit cover/obscured", () => {
      const engine = makeEngine();
      const ctx = makeCtx({
        wr: [{ id: "blast", value: 2 }],
        modifiers: {
          primaryBlast: { targetId: "t1", cover: true, obscured: false },
        },
        currentAttackItem: {
          targetId: "t2",
          isBlastSecondary: true,
          inheritFromPrimary: true,
        },
      });

      engine.runWeaponRuleHook(ctx, "ON_BEGIN_ATTACK_SEQUENCE");

      expectModifier(ctx, "ignoreConcealForTargeting", true);
      expectModifier(ctx, "targetInCover", true);
      expectModifier(ctx, "targetObscured", false);
    });
  });
});
