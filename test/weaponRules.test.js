// test/weaponRules.test.js
import { expect } from "chai";
import {
  applyPhase,
  clickRule,
  expectDisabled,
  expectModifier,
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
      const prompt = expectPrompt(ctx, { type: "ceaseless", phase: "ROLL" });
      expect(prompt.steps[0]).to.equal(
        "Reroll all dice showing value 1 (largest miss group).",
      );
      const logEntry = expectLogged(ctx, "RULE_CEASELESS_CLICK");
      expect(logEntry.detail.value).to.equal(1);
    });

    it("uses lowest value when miss groups tie", () => {
      const engine = makeEngine();
      const ctx = makeCtx({
        weapon: { atk: 4, hit: 4 },
        attackDice: [{ value: 1 }, { value: 1 }, { value: 2 }, { value: 2 }],
        wr: [{ id: "ceaseless" }],
      });

      clickRule(engine, ctx, "ceaseless", "ROLL");

      const prompt = expectPrompt(ctx, { type: "ceaseless", phase: "ROLL" });
      expect(prompt.steps[0]).to.equal(
        "Reroll all dice showing value 1 (largest miss group).",
      );
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

    it("adds crit threshold to balanced prompt wording", () => {
      const engine = makeEngine();
      const ctx = makeCtx({
        weapon: { atk: 4, hit: 4 },
        attackDice: [{ value: 1 }],
        wr: [{ id: "lethal", value: 5 }, { id: "balanced" }],
      });

      applyPhase(engine, ctx, "ROLL");

      const prompt = expectPrompt(ctx, { type: "balanced", phase: "ROLL" });
      expect(prompt.steps[0]).to.include("crits on 5+");
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
    it("appears in POST_ROLL only when retained crits exist", () => {
      const engine = makeEngine();
      const ctx = makeCtx({
        weapon: { atk: 4, hit: 4 },
        wr: [{ id: "devastating", value: 3 }],
        attackDice: [
          { value: 6, tags: ["crit", "retained"] },
          { value: 4, tags: ["hit", "retained"] },
        ],
      });

      applyPhase(engine, ctx, "POST_ROLL");

      expect(ctx.ui.availableRules.POST_ROLL).to.include("devastating");
      expectPrompt(ctx, { type: "devastating", phase: "POST_ROLL" });
      expectSuggested(ctx, "devastatingCrits", 1);
    });

    it("click logs resolve and flags applied", () => {
      const engine = makeEngine();
      const ctx = makeCtx({
        weapon: { atk: 4, hit: 4 },
        wr: [{ id: "devastating", value: 3 }],
        attackDice: [
          { value: 6, tags: ["crit", "retained"] },
          { value: 5, tags: ["crit", "retained"] },
        ],
      });

      clickRule(engine, ctx, "devastating", "POST_ROLL");

      expectSuggested(ctx, "applyDamage", 6);
      expect(ctx.modifiers.devastatingApplied).to.equal(true);
      const prompt = expectPrompt(ctx, { type: "devastating", phase: "POST_ROLL" });
      expect(prompt.steps[0]).to.equal(
        "Apply 3 damage per retained crit now (6 total).",
      );
      const logEntry = expectLogged(ctx, "RULE_DEVASTATING_RESOLVE");
      expect(logEntry.detail.damage).to.equal(6);
    });
  });

  describe("Crit threshold prompts", () => {
    it("adds crit threshold to severe prompt", () => {
      const engine = makeEngine();
      const ctx = makeCtx({
        wr: [{ id: "severe" }],
        modifiers: { lethalThreshold: 5 },
        attackDice: [{ value: 4, tags: ["hit", "retained"] }],
      });

      applyPhase(engine, ctx, "POST_ROLL");

      const prompt = expectPrompt(ctx, { type: "severe", phase: "POST_ROLL" });
      expect(prompt.steps[0]).to.equal(
        "Severe: if no crits retained, upgrade one hit to a crit.",
      );
    });

    it("adds crit threshold to rending prompt", () => {
      const engine = makeEngine();
      const ctx = makeCtx({
        wr: [{ id: "rending" }],
        modifiers: { lethalThreshold: 5 },
        attackDice: [
          { value: 6, tags: ["crit", "retained"] },
          { value: 4, tags: ["hit", "retained"] },
        ],
      });

      applyPhase(engine, ctx, "POST_ROLL");

      const prompt = expectPrompt(ctx, { type: "rending", phase: "POST_ROLL" });
      expect(prompt.steps[0]).to.equal(
        "Rending: upgrade one retained hit to a crit (crits on 5+).",
      );
    });

    it("adds crit threshold to punishing prompt", () => {
      const engine = makeEngine();
      const ctx = makeCtx({
        wr: [{ id: "punishing" }],
        modifiers: { lethalThreshold: 5 },
        weapon: { atk: 4, hit: 4 },
        attackDice: [
          { value: 6, tags: ["crit", "retained"] },
          { value: 1, tags: ["retained"] },
        ],
      });

      applyPhase(engine, ctx, "POST_ROLL");

      const prompt = expectPrompt(ctx, { type: "punishing", phase: "POST_ROLL" });
      expect(prompt.steps[0]).to.equal(
        "If you retained a crit, you may retain one fail as a hit.",
      );
    });
  });

  describe("Brutal", () => {
    it("disables normal blocks, keeps cover blocks, and logs", () => {
      const engine = makeEngine();
      const ctx = makeCtx({
        weapon: { atk: 3, hit: 4 },
        wr: [{ id: "brutal" }],
        coverBlocks: [{ id: "cover-1" }],
        defenseDice: [
          { value: 5, tags: ["success"] },
          { value: 6, tags: ["crit"] },
        ],
      });

      applyPhase(engine, ctx, "POST_ROLL");

      expect(ctx.ui.availableRules.POST_ROLL).to.include("brutal");
      expectPrompt(ctx, { type: "brutal", phase: "POST_ROLL" });
      expectDisabled(ctx, "blockNormal", true);
      expect(ctx.eligibleBlocks).to.deep.equal([
        { id: "cover-1" },
        { value: 6, tags: ["crit"] },
      ]);
      const logEntry = expectLogged(ctx, "RULE_BRUTAL_APPLIED");
      expect(logEntry.detail.removedNormalBlocks).to.equal(1);
      expect(logEntry.detail.remainingCritBlocks).to.equal(1);
      expect(logEntry.detail.coverBlocks).to.equal(1);
    });
  });

  describe("Heavy", () => {
    it("blocks shooting after movement and logs", () => {
      const engine = makeEngine();
      const ctx = makeCtx({
        wr: [{ id: "heavy" }],
        inputs: { movementAction: "reposition" },
      });

      applyPhase(engine, ctx, "PRE_ROLL");

      expect(ctx.ui.availableRules.PRE_ROLL).to.include("heavy");
      expect(ctx.ui.disabledOptions.shootAfterMove).to.equal(true);
      const logEntry = expectLogged(ctx, "RULE_HEAVY_GATING");
      expect(logEntry.detail.blocked).to.equal(true);
    });

    it("does not block when the unit did not move", () => {
      const engine = makeEngine();
      const ctx = makeCtx({
        wr: [{ id: "heavy" }],
        inputs: { movementAction: null },
      });

      applyPhase(engine, ctx, "PRE_ROLL");

      expect(ctx.ui.disabledOptions.shootAfterMove).to.not.equal(true);
    });

    it("dash-only allows dash but blocks other movement", () => {
      const engine = makeEngine();
      const dashCtx = makeCtx({
        wr: [{ id: "heavy", note: "Dash only" }],
        inputs: { movementAction: "dash" },
      });
      const repositionCtx = makeCtx({
        wr: [{ id: "heavy", note: "Dash only" }],
        inputs: { movementAction: "reposition" },
      });

      applyPhase(engine, dashCtx, "PRE_ROLL");
      applyPhase(engine, repositionCtx, "PRE_ROLL");

      expect(dashCtx.ui.disabledOptions.shootAfterMove).to.not.equal(true);
      expect(repositionCtx.ui.disabledOptions.shootAfterMove).to.equal(true);
    });
  });

  describe("Hot", () => {
    it("appears in POST_ROLL when weapon is hot", () => {
      const engine = makeEngine();
      const ctx = makeCtx({
        wr: [{ id: "hot" }],
      });

      applyPhase(engine, ctx, "POST_ROLL");

      expect(ctx.ui.availableRules.POST_ROLL).to.include("hot");
      expectPrompt(ctx, { type: "hot", phase: "POST_ROLL" });
    });

    it("click adds self-damage prompt, flags resolved, and logs", () => {
      const engine = makeEngine();
      const ctx = makeCtx({
        wr: [{ id: "hot", value: 3 }],
      });

      clickRule(engine, ctx, "hot", "POST_ROLL");

      expect(ctx.modifiers.hotResolved).to.equal(true);
      const prompt = expectPrompt(ctx, { type: "hot", phase: "POST_ROLL" });
      expect(prompt.steps[0]).to.equal("Roll 1d6; on 1 take 3 MW.");
      const logEntry = expectLogged(ctx, "RULE_HOT_CLICK");
      expect(logEntry.detail.mortalWounds).to.equal(3);
    });
  });

  describe("Limited X", () => {
    it("shows remaining uses note in PRE_ROLL", () => {
      const engine = makeEngine();
      const ctx = makeCtx({
        wr: [{ id: "limited", value: 2 }],
      });

      applyPhase(engine, ctx, "PRE_ROLL");

      expect(ctx.ui.notes).to.include("Limited: remaining 2");
    });

    it("click consumes a use and logs", () => {
      const engine = makeEngine();
      const ctx = makeCtx({
        wr: [{ id: "limited", value: 2 }],
        modifiers: { limitedRemaining: 2 },
      });

      clickRule(engine, ctx, "limited", "PRE_ROLL");

      expect(ctx.modifiers.limitedRemaining).to.equal(1);
      const logEntry = expectLogged(ctx, "RULE_LIMITED_CONSUME");
      expect(logEntry.detail.remaining).to.equal(1);
    });

    it("disables when remaining reaches 0 and warns", () => {
      const engine = makeEngine();
      const ctx = makeCtx({
        wr: [{ id: "limited", value: 1 }],
        modifiers: { limitedRemaining: 1 },
      });

      clickRule(engine, ctx, "limited", "PRE_ROLL");

      expect(ctx.modifiers.limitedRemaining).to.equal(0);
      expect(ctx.ui.disabledOptions.limited).to.equal(true);
      const prompt = expectPrompt(ctx, { type: "limited", phase: "PRE_ROLL" });
      expect(prompt.steps[0]).to.equal("Limited: No uses left.");
    });
  });

  describe("Piercing X", () => {
    it("suggests defender rolls fewer dice in PRE_ROLL and logs", () => {
      const engine = makeEngine();
      const ctx = makeCtx({
        wr: [{ id: "piercing", value: 2 }],
      });

      applyPhase(engine, ctx, "PRE_ROLL");

      expectSuggested(ctx, "defenseDiceMod", -2);
      const logEntry = expectLogged(ctx, "RULE_PIERCING_APPLIED");
      expect(logEntry.detail.value).to.equal(2);
    });
  });

  describe("Piercing Crits X", () => {
    it("does not apply when no retained crits", () => {
      const engine = makeEngine();
      const ctx = makeCtx({
        wr: [{ id: "piercing-crits", value: 1 }],
        attackDice: [{ value: 5, tags: ["hit", "retained"] }],
      });

      applyPhase(engine, ctx, "POST_ROLL");

      expect(ctx.ui.availableRules.POST_ROLL || []).to.not.include(
        "piercing-crits",
      );
      expect(ctx.ui.suggestedInputs.defenseDiceMod).to.equal(undefined);
    });

    it("applies when retained crit exists", () => {
      const engine = makeEngine();
      const ctx = makeCtx({
        wr: [{ id: "piercing-crits", value: 2 }],
        attackDice: [
          { value: 6, tags: ["crit", "retained"] },
          { value: 4, tags: ["hit", "retained"] },
        ],
      });

      applyPhase(engine, ctx, "POST_ROLL");

      expectSuggested(ctx, "defenseDiceMod", -2);
      const logEntry = expectLogged(ctx, "RULE_PIERCING_CRITS_APPLIED");
      expect(logEntry.detail.retainedCrits).to.equal(1);
    });
  });

  describe("Punishing", () => {
    it("is hidden unless retained crits and misses exist", () => {
      const engine = makeEngine();
      const ctx = makeCtx({
        weapon: { atk: 4, hit: 4 },
        wr: [{ id: "punishing" }],
        attackDice: [
          { value: 6, tags: ["crit", "retained"] },
          { value: 4, tags: ["hit", "retained"] },
        ],
      });

      applyPhase(engine, ctx, "POST_ROLL");

      expect(ctx.ui.availableRules.POST_ROLL || []).to.not.include("punishing");
    });

    it("appears when retained crits and fails exist", () => {
      const engine = makeEngine();
      const ctx = makeCtx({
        weapon: { atk: 4, hit: 4 },
        wr: [{ id: "punishing" }],
        attackDice: [
          { value: 6, tags: ["crit", "retained"] },
          { value: 2, tags: ["retained"] },
        ],
      });

      applyPhase(engine, ctx, "POST_ROLL");

      expect(ctx.ui.availableRules.POST_ROLL).to.include("punishing");
      const prompt = expectPrompt(ctx, { type: "punishing", phase: "POST_ROLL" });
      expect(prompt.steps[0]).to.equal(
        "If you retained a crit, you may retain one fail as a hit.",
      );
    });

    it("click sets used, instructs flip, and logs", () => {
      const engine = makeEngine();
      const ctx = makeCtx({
        wr: [{ id: "punishing" }],
      });

      clickRule(engine, ctx, "punishing", "POST_ROLL");

      expect(ctx.modifiers.punishingUsed).to.equal(true);
      const prompt = expectPrompt(ctx, { type: "punishing", phase: "POST_ROLL" });
      expect(prompt.steps[0]).to.equal("Retain one failed die as a hit.");
      const logEntry = expectLogged(ctx, "RULE_PUNISHING_CLICK");
      expect(logEntry.detail.phase).to.equal("POST_ROLL");
    });
  });

  describe("Range X", () => {
    it("blocks target selection and logs when out of range", () => {
      const engine = makeEngine();
      const ctx = makeCtx({
        wr: [{ id: "range", value: 6 }],
        inputs: { targetDistance: 7 },
      });

      applyPhase(engine, ctx, "PRE_ROLL");

      expect(ctx.ui.disabledOptions.canSelectTarget).to.equal(true);
      expect(ctx.ui.notes).to.include("Out of Range");
      const logEntry = expectLogged(ctx, "RULE_RANGE_BLOCKED");
      expect(logEntry.detail.distance).to.equal(7);
    });

    it("does not restrict when within range", () => {
      const engine = makeEngine();
      const ctx = makeCtx({
        wr: [{ id: "range", value: 6 }],
        inputs: { targetDistance: 4 },
      });

      applyPhase(engine, ctx, "PRE_ROLL");

      expect(ctx.ui.disabledOptions.canSelectTarget).to.not.equal(true);
      const hasOutOfRange = (ctx.ui.notes || []).includes("Out of Range");
      expect(hasOutOfRange).to.equal(false);
    });
  });

  describe("Relentless", () => {
    it("click without selection prompts for selection", () => {
      const engine = makeEngine();
      const ctx = makeCtx({
        wr: [{ id: "relentless" }],
      });

      clickRule(engine, ctx, "relentless", "ROLL");

      const prompt = expectPrompt(ctx, { type: "relentless", phase: "ROLL" });
      expect(prompt.steps[0]).to.equal("Select which attack dice to reroll.");
      expect(ctx.modifiers.relentlessUsed).to.not.equal(true);
    });

    it("click with reroll selection logs and instructs reroll", () => {
      const engine = makeEngine();
      const ctx = makeCtx({
        wr: [{ id: "relentless" }],
      });

      clickRule(engine, ctx, "relentless", "ROLL", { rerollIndices: [0, 2] });

      expect(ctx.modifiers.relentlessUsed).to.equal(true);
      const prompt = expectPrompt(ctx, { type: "relentless", phase: "ROLL" });
      expect(prompt.steps[0]).to.equal("Reroll those dice now.");
      const logEntry = expectLogged(ctx, "RULE_RELENTLESS_CLICK");
      expect(logEntry.detail.rerollIndices).to.deep.equal([0, 2]);
    });
  });

  describe("Rending", () => {
    it("is hidden unless retained crits and retained hits exist", () => {
      const engine = makeEngine();
      const ctx = makeCtx({
        wr: [{ id: "rending" }],
        attackDice: [
          { value: 6, tags: ["crit", "retained"] },
          { value: 2, tags: ["retained"] },
        ],
      });

      applyPhase(engine, ctx, "POST_ROLL");

      expect(ctx.ui.availableRules.POST_ROLL || []).to.not.include("rending");
    });

    it("appears when retained crits and retained hits exist", () => {
      const engine = makeEngine();
      const ctx = makeCtx({
        wr: [{ id: "rending" }],
        attackDice: [
          { value: 6, tags: ["crit", "retained"] },
          { value: 4, tags: ["hit", "retained"] },
        ],
      });

      applyPhase(engine, ctx, "POST_ROLL");

      expect(ctx.ui.availableRules.POST_ROLL).to.include("rending");
      const prompt = expectPrompt(ctx, { type: "rending", phase: "POST_ROLL" });
      expect(prompt.steps[0]).to.equal(
        "Rending: upgrade one retained hit to a crit.",
      );
    });

    it("click sets used, instructs upgrade, and logs", () => {
      const engine = makeEngine();
      const ctx = makeCtx({
        wr: [{ id: "rending" }],
      });

      clickRule(engine, ctx, "rending", "POST_ROLL");

      expect(ctx.modifiers.rendingUsed).to.equal(true);
      const prompt = expectPrompt(ctx, { type: "rending", phase: "POST_ROLL" });
      expect(prompt.steps[0]).to.equal("Upgrade one retained hit → retained crit.");
      const logEntry = expectLogged(ctx, "RULE_RENDING_CLICK");
      expect(logEntry.detail.phase).to.equal("POST_ROLL");
    });
  });

  describe("Saturate", () => {
    it("disables cover retain and clears cover blocks", () => {
      const engine = makeEngine();
      const ctx = makeCtx({
        wr: [{ id: "saturate" }],
        coverBlocks: [{ id: "cover-1" }],
      });

      applyPhase(engine, ctx, "PRE_ROLL");

      expect(ctx.ui.disabledOptions.retainCover).to.equal(true);
      expect(ctx.coverBlocks).to.deep.equal([]);
      const logEntry = expectLogged(ctx, "RULE_SATURATE_APPLIED");
      expect(logEntry.detail.phase).to.equal("PRE_ROLL");
    });
  });

  describe("Severe", () => {
    it("is hidden when retained crits exist", () => {
      const engine = makeEngine();
      const ctx = makeCtx({
        wr: [{ id: "severe" }],
        attackDice: [
          { value: 6, tags: ["crit", "retained"] },
          { value: 4, tags: ["hit", "retained"] },
        ],
      });

      applyPhase(engine, ctx, "POST_ROLL");

      expect(ctx.ui.availableRules.POST_ROLL || []).to.not.include("severe");
    });

    it("appears when no retained crits and retained hit exists", () => {
      const engine = makeEngine();
      const ctx = makeCtx({
        wr: [{ id: "severe" }],
        attackDice: [{ value: 4, tags: ["hit", "retained"] }],
      });

      applyPhase(engine, ctx, "POST_ROLL");

      expect(ctx.ui.availableRules.POST_ROLL).to.include("severe");
      const prompt = expectPrompt(ctx, { type: "severe", phase: "POST_ROLL" });
      expect(prompt.steps[0]).to.equal(
        "Severe: if no crits retained, upgrade one hit to a crit.",
      );
    });

    it("click sets active, prompts upgrade, and logs", () => {
      const engine = makeEngine();
      const ctx = makeCtx({
        wr: [{ id: "severe" }],
      });

      clickRule(engine, ctx, "severe", "POST_ROLL");

      expect(ctx.modifiers.severeActive).to.equal(true);
      const prompt = expectPrompt(ctx, { type: "severe", phase: "POST_ROLL" });
      expect(prompt.steps[0]).to.equal("Upgrade one retained hit → crit.");
      const logEntry = expectLogged(ctx, "RULE_SEVERE_CLICK");
      expect(logEntry.detail.phase).to.equal("POST_ROLL");
    });

    it("disables punishing and rending when severe is active", () => {
      const engine = makeEngine();
      const ctx = makeCtx({
        wr: [{ id: "severe" }, { id: "punishing" }, { id: "rending" }],
        modifiers: { severeActive: true },
      });

      applyPhase(engine, ctx, "POST_ROLL");

      const punishingPrompt = expectPrompt(ctx, { type: "punishing", phase: "POST_ROLL" });
      const rendingPrompt = expectPrompt(ctx, { type: "rending", phase: "POST_ROLL" });
      expect(punishingPrompt.enabled).to.equal(false);
      expect(rendingPrompt.enabled).to.equal(false);
    });
  });

  describe("Shock", () => {
    it("adds a shock note in POST_ROLL", () => {
      const engine = makeEngine();
      const ctx = makeCtx({
        wr: [{ id: "shock" }],
      });

      applyPhase(engine, ctx, "POST_ROLL");

      expect(ctx.ui.notes).to.include(
        "Shock: first crit strike discards a normal defense success (or crit if none)",
      );
    });

    it("click arms shock and logs", () => {
      const engine = makeEngine();
      const ctx = makeCtx({
        wr: [{ id: "shock" }],
      });

      clickRule(engine, ctx, "shock", "POST_ROLL");

      expect(ctx.modifiers.shockArmed).to.equal(true);
      const logEntry = expectLogged(ctx, "RULE_SHOCK_ARM");
      expect(logEntry.detail.phase).to.equal("POST_ROLL");
    });
  });

  describe("Silent", () => {
    it("sets canShootWhileConcealed in PRE_ROLL", () => {
      const engine = makeEngine();
      const ctx = makeCtx({
        wr: [{ id: "silent" }],
      });

      applyPhase(engine, ctx, "PRE_ROLL");

      expect(ctx.modifiers.canShootWhileConcealed).to.equal(true);
    });
  });

  describe("Stun", () => {
    it("is hidden when no retained crits", () => {
      const engine = makeEngine();
      const ctx = makeCtx({
        wr: [{ id: "stun" }],
        attackDice: [{ value: 4, tags: ["hit", "retained"] }],
      });

      applyPhase(engine, ctx, "POST_ROLL");

      expect(ctx.ui.availableRules.POST_ROLL || []).to.not.include("stun");
    });

    it("click applies stun effect, prompts, and logs", () => {
      const engine = makeEngine();
      const ctx = makeCtx({
        wr: [{ id: "stun" }],
      });

      clickRule(engine, ctx, "stun", "POST_ROLL");

      expect(ctx.target.effects.stun).to.deep.equal({
        aplMod: -1,
        expires: "end_next_activation",
      });
      const prompt = expectPrompt(ctx, { type: "stun", phase: "POST_ROLL" });
      expect(prompt.steps[0]).to.equal("Mark target as Stunned (-1 APL).");
      const logEntry = expectLogged(ctx, "RULE_STUN_APPLY");
      expect(logEntry.detail.phase).to.equal("POST_ROLL");
    });
  });

  describe("Torrent X", () => {
    it("builds attack queue and prompts in PRE_ROLL", () => {
      const engine = makeEngine();
      const ctx = makeCtx({
        wr: [{ id: "torrent", value: 6 }],
        inputs: {
          primaryTargetId: "t1",
          secondaryTargetIds: ["t2", "t3", "t2"],
        },
      });

      applyPhase(engine, ctx, "PRE_ROLL");

      expect(ctx.attackQueue).to.have.length(3);
      const prompt = expectPrompt(ctx, { type: "torrent", phase: "PRE_ROLL" });
      expect(prompt.steps[0]).to.equal("Resolve attacks against: t1, t2, t3.");
      expect(ctx.modifiers.ignoreConcealForTargeting).to.equal(true);
      const logEntry = expectLogged(ctx, "RULE_TORRENT_DECLARE");
      expect(logEntry.detail.queueSize).to.equal(3);
    });
  });

  describe("Seek", () => {
    it("sets seek modifier in PRE_ROLL", () => {
      const engine = makeEngine();
      const ctx = makeCtx({
        wr: [{ id: "seek", value: "heavy" }],
      });

      applyPhase(engine, ctx, "PRE_ROLL");

      expect(ctx.modifiers.seek).to.equal("heavy");
      const logEntry = expectLogged(ctx, "RULE_SEEK_APPLIED");
      expect(logEntry.detail.seekType).to.equal("heavy");
    });

    it("unblocks targets in matching cover", () => {
      const engine = makeEngine();
      const ctx = makeCtx({
        wr: [{ id: "seek", value: "light" }],
        inputs: {
          targetCoverType: "light",
          targetBlockedByCover: true,
        },
        ui: {
          disabledOptions: { canSelectTarget: true },
        },
      });

      applyPhase(engine, ctx, "PRE_ROLL");

      expect(ctx.ui.disabledOptions.canSelectTarget).to.equal(false);
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
