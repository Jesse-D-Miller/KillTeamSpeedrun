import { expect } from "chai";
import {
  applyPhase,
  expectLogged,
  expectPrompt,
  makeCtx,
  makeEngine,
} from "./helpers/rulesHarness.js";

describe("weapon rules interactions", () => {
  it("severe disables punishing and rending", () => {
    const engine = makeEngine();
    const ctx = makeCtx({
      wr: [{ id: "severe" }, { id: "punishing" }, { id: "rending" }],
      modifiers: { severeActive: true },
    });

    applyPhase(engine, ctx, "POST_ROLL");

    const punishingPrompt = expectPrompt(ctx, {
      type: "punishing",
      phase: "POST_ROLL",
    });
    const rendingPrompt = expectPrompt(ctx, { type: "rending", phase: "POST_ROLL" });
    expect(punishingPrompt.enabled).to.equal(false);
    expect(rendingPrompt.enabled).to.equal(false);
    expect(ctx.ui.disabledOptions.punishing).to.equal("severe");
    expect(ctx.ui.disabledOptions.rending).to.equal("severe");
  });

  it("lethal threshold affects stun eligibility", () => {
    const engine = makeEngine();
    const base = {
      weapon: { atk: 4, hit: 4 },
      attackDice: [{ value: 5, tags: ["retained"] }],
      wr: [{ id: "stun" }],
    };

    const ctxNoLethal = makeCtx(base);
    applyPhase(engine, ctxNoLethal, "POST_ROLL");
    expect(ctxNoLethal.ui.availableRules.POST_ROLL || []).to.not.include("stun");

    const ctxWithLethal = makeCtx({
      ...base,
      modifiers: { lethalThreshold: 5 },
    });
    applyPhase(engine, ctxWithLethal, "POST_ROLL");
    expect(ctxWithLethal.ui.availableRules.POST_ROLL).to.include("stun");
  });

  it("lethal threshold affects devastating eligibility", () => {
    const engine = makeEngine();
    const base = {
      weapon: { atk: 4, hit: 4 },
      attackDice: [{ value: 5, tags: ["retained"] }],
      wr: [{ id: "devastating", value: 2 }],
    };

    const ctxNoLethal = makeCtx(base);
    applyPhase(engine, ctxNoLethal, "POST_ROLL");
    expect(ctxNoLethal.ui.availableRules.POST_ROLL || []).to.not.include(
      "devastating",
    );

    const ctxWithLethal = makeCtx({
      ...base,
      modifiers: { lethalThreshold: 5 },
    });
    applyPhase(engine, ctxWithLethal, "POST_ROLL");
    expect(ctxWithLethal.ui.availableRules.POST_ROLL).to.include("devastating");
  });

  it("lethal threshold affects piercing crits eligibility", () => {
    const engine = makeEngine();
    const base = {
      weapon: { atk: 4, hit: 4 },
      attackDice: [{ value: 5, tags: ["retained"] }],
      wr: [{ id: "piercing-crits", value: 1 }],
    };

    const ctxNoLethal = makeCtx(base);
    applyPhase(engine, ctxNoLethal, "POST_ROLL");
    expect(ctxNoLethal.ui.availableRules.POST_ROLL || []).to.not.include(
      "piercing-crits",
    );

    const ctxWithLethal = makeCtx({
      ...base,
      modifiers: { lethalThreshold: 5 },
    });
    applyPhase(engine, ctxWithLethal, "POST_ROLL");
    expect(ctxWithLethal.ui.availableRules.POST_ROLL).to.include("piercing-crits");
  });

  it("blast snapshots cover and dedupes targets", () => {
    const engine = makeEngine();
    const ctx = makeCtx({
      wr: [{ id: "blast", value: 2 }],
      inputs: {
        primaryTargetId: "t1",
        secondaryTargetIds: ["t2", "t1", "t2"],
      },
      modifiers: {
        primaryBlast: { targetId: "t1", cover: true, obscured: false },
      },
    });

    engine.runWeaponRuleHook(ctx, "ON_DECLARE_ATTACK");
    expect(ctx.attackQueue).to.have.length(2);

    ctx.currentAttackItem = {
      targetId: "t2",
      isBlastSecondary: true,
      inheritFromPrimary: true,
    };
    engine.runWeaponRuleHook(ctx, "ON_BEGIN_ATTACK_SEQUENCE");

    expect(ctx.modifiers.targetInCover).to.equal(true);
    expect(ctx.modifiers.targetObscured).to.equal(false);
  });

  it("torrent queue dedupes targets and logs", () => {
    const engine = makeEngine();
    const ctx = makeCtx({
      wr: [{ id: "torrent", value: 6 }],
      inputs: {
        primaryTargetId: "t1",
        secondaryTargetIds: ["t2", "t2", "t3"],
      },
    });

    applyPhase(engine, ctx, "PRE_ROLL");

    expect(ctx.attackQueue).to.have.length(3);
    const logEntry = expectLogged(ctx, "RULE_TORRENT_DECLARE");
    expect(logEntry.detail.secondaryTargetIds).to.deep.equal(["t2", "t3"]);
  });

  it("limited stays blocked at 0 across phases", () => {
    const engine = makeEngine();
    const ctx = makeCtx({
      wr: [{ id: "limited", value: 1 }],
      modifiers: { limitedRemaining: 0 },
    });

    applyPhase(engine, ctx, "PRE_ROLL");
    expect(ctx.modifiers.limitedRemaining).to.equal(0);
    expect(ctx.ui.disabledOptions.limited).to.equal(true);

    applyPhase(engine, ctx, "PRE_ROLL");
    expect(ctx.modifiers.limitedRemaining).to.equal(0);
    expect(ctx.ui.disabledOptions.limited).to.equal(true);
  });

  it("brutal and saturate keep cover suppression consistent", () => {
    const engine = makeEngine();
    const ctx = makeCtx({
      wr: [{ id: "saturate" }, { id: "brutal" }],
      coverBlocks: [{ id: "cover-1" }],
      defenseDice: [
        { value: 6, tags: ["crit"] },
        { value: 5, tags: ["success"] },
      ],
    });

    applyPhase(engine, ctx, "PRE_ROLL");
    applyPhase(engine, ctx, "POST_ROLL");

    expect(ctx.coverBlocks).to.deep.equal([]);
    expect(ctx.eligibleBlocks).to.deep.equal([{ value: 6, tags: ["crit"] }]);
  });
});
