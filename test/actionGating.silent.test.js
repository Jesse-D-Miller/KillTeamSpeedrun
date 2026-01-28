import { expect } from "chai";
import { applyEvent, initialSession } from "../src/state/gameSessionReducer.js";

const buildSession = ({ weapons }) => {
  const attacker = {
    id: "attacker",
    teamId: "teamA",
    state: {
      order: "conceal",
      woundsCurrent: 10,
      activation: { aplCurrent: 1 },
    },
    stats: { apl: 2, move: 6, save: 3, woundsMax: 10 },
    weapons,
  };

  const defender = {
    id: "defender",
    teamId: "teamB",
    state: { order: "engage", woundsCurrent: 10 },
    stats: { apl: 2, move: 6, save: 3, woundsMax: 10 },
    weapons: [],
  };

  return initialSession({
    players: [
      { id: "p1", selectedTeamId: "teamA" },
      { id: "p2", selectedTeamId: "teamB" },
    ],
    teamsById: {
      teamA: { id: "teamA", operatives: [attacker] },
      teamB: { id: "teamB", operatives: [defender] },
    },
    active: {
      turn: 1,
      round: 1,
      turningPoint: 1,
      phase: "FIREFIGHT",
      initiativePlayerId: "p1",
      activePlayerId: "p1",
      started: true,
      activationSubstep: "PERFORM_ACTIONS",
      activation: { operativeId: "attacker", aplCurrent: 1 },
    },
  });
};

describe("Silent action gating", () => {
  it("allows shoot while concealed when weapon is silent", () => {
    const session = buildSession({
      weapons: [{ id: "silent-gun", wr: ["silent"] }],
    });

    const next = applyEvent(session, {
      id: "ev-1",
      t: Date.now(),
      actorPlayerId: "p1",
      type: "DECLARE_ATTACK",
      payload: {
        attackerId: "attacker",
        defenderId: "defender",
        weaponId: "silent-gun",
        attackType: "shoot",
      },
    });

    expect(next.currentAttack).to.not.equal(null);
  });

  it("blocks shoot while concealed without silent", () => {
    const session = buildSession({
      weapons: [{ id: "loud-gun", wr: [] }],
    });

    const next = applyEvent(session, {
      id: "ev-2",
      t: Date.now(),
      actorPlayerId: "p1",
      type: "DECLARE_ATTACK",
      payload: {
        attackerId: "attacker",
        defenderId: "defender",
        weaponId: "loud-gun",
        attackType: "shoot",
      },
    });

    expect(next.currentAttack).to.equal(null);
  });
});
