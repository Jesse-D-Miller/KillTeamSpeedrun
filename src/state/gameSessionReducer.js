const PHASE_ORDER = ["SETUP", "STRATEGY", "FIREFIGHT", "END_TP", "GAME_OVER"];

const generateId = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const nowIso = () => new Date().toISOString();

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const normalizeRuleId = (id) =>
  String(id || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");

const weaponHasRule = (weapon, ruleId) => {
  const normalizedRuleId = normalizeRuleId(ruleId);
  const raw = weapon?.wr ?? weapon?.rules ?? [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list.some((entry) => {
    const id = typeof entry === "string" ? entry : entry?.id;
    if (!id) return false;
    const normalized = normalizeRuleId(id);
    return normalized === normalizedRuleId || normalized.startsWith(`${normalizedRuleId}-`);
  });
};

const getPlayerById = (session, playerId) =>
  session.players.find((player) => player.id === playerId) || null;

const getOtherPlayerId = (session, playerId) =>
  session.players.find((player) => player.id !== playerId)?.id || "";

const getPlayerByTeamId = (session, teamId) =>
  session.players.find((player) => player.selectedTeamId === teamId) || null;

const getTeamByPlayerId = (session, playerId) => {
  const player = getPlayerById(session, playerId);
  if (!player?.selectedTeamId) return null;
  return session.teamsById[player.selectedTeamId] || null;
};

const getExpectedActivePlayerId = (session) => {
  const order = session.active.activationPriority || [];
  if (order.length === 0) return session.active.activePlayerId || "";
  const turnIndex = Math.max(0, (session.active.turn || 1) - 1);
  return order[turnIndex % order.length] || "";
};

const countReadyOperativesForPlayer = (session, playerId) => {
  const team = Object.values(session.teamsById).find(
    (t) => getPlayerByTeamId(session, t.id)?.id === playerId,
  );
  if (!team) return 0;
  return team.operatives.filter(
    (op) => op.state?.ready !== false && op.state?.woundsCurrent > 0,
  ).length;
};

const resetEndOfTurnEffects = (operative) => ({
  ...operative,
  state: {
    ...operative.state,
    effects: [],
    tokens: Array.isArray(operative.state?.tokens)
      ? operative.state.tokens.filter((token) => token?.expires?.when !== "END_TP")
      : [],
  },
});

const updateDerivedForTokenToggle = (operative, tokenKey, hasToken) => {
  if (!tokenKey) return operative;
  const normalizedKey = String(tokenKey).toLowerCase();
  const blockedCounteract = normalizedKey === "guard" && hasToken;
  return {
    ...operative,
    state: {
      ...operative.state,
      blockedCounteract: blockedCounteract
        ? true
        : operative.state?.blockedCounteract ?? false,
    },
  };
};

const applyWoundsOverride = (operative, woundsCurrent) => {
  const stats = operative.base?.stats ?? operative.stats;
  const woundsMax = stats?.woundsMax ?? 0;
  const clamped = clamp(woundsCurrent, 0, woundsMax);
  const injured = clamped < woundsMax / 2;
  const incapacitated = clamped <= 0;

  return {
    ...operative,
    state: {
      ...operative.state,
      woundsCurrent: clamped,
      injured,
      incapacitated,
      removed: incapacitated ? true : operative.state?.removed ?? false,
      ready: incapacitated ? false : operative.state?.ready ?? true,
      expended: incapacitated ? true : operative.state?.expended ?? false,
      tokens: incapacitated
        ? (operative.state?.tokens || []).filter((token) => token?.expires?.when !== "NEVER")
        : operative.state?.tokens,
      activation: {
        ...operative.state?.activation,
        activatedThisRound: incapacitated
          ? true
          : operative.state?.activation?.activatedThisRound ?? false,
      },
    },
  };
};

const parseWeaponDamage = (weapon) => {
  const dmg = weapon?.dmg ?? weapon?.damage;
  if (typeof dmg === "string") {
    const [normal, crit] = dmg.split("/").map((value) => Number(value));
    return {
      normal: Number.isFinite(normal) ? normal : 0,
      crit: Number.isFinite(crit) ? crit : 0,
    };
  }
  if (typeof dmg === "number") {
    return { normal: dmg, crit: dmg };
  }
  return { normal: 0, crit: 0 };
};

const resolveDamageAllocation = ({ hits, crits, saves, critSaves }) => {
  let remainingHits = hits;
  let remainingCrits = crits;
  let remainingSaves = saves;
  let remainingCritSaves = critSaves;

  // Crit saves cancel crits first.
  const critsCanceledByCritSaves = Math.min(remainingCrits, remainingCritSaves);
  remainingCrits -= critsCanceledByCritSaves;
  remainingCritSaves -= critsCanceledByCritSaves;

  // Regular saves cancel regular hits first.
  const hitsCanceledBySaves = Math.min(remainingHits, remainingSaves);
  remainingHits -= hitsCanceledBySaves;
  remainingSaves -= hitsCanceledBySaves;

  // Remaining crit saves cancel remaining hits.
  if (remainingCritSaves > 0 && remainingHits > 0) {
    const hitsCanceledByCritSaves = Math.min(remainingHits, remainingCritSaves);
    remainingHits -= hitsCanceledByCritSaves;
    remainingCritSaves -= hitsCanceledByCritSaves;
  }

  // Remaining saves cancel remaining crits.
  if (remainingSaves > 0 && remainingCrits > 0) {
    const critsCanceledBySaves = Math.min(remainingCrits, remainingSaves);
    remainingCrits -= critsCanceledBySaves;
    remainingSaves -= critsCanceledBySaves;
  }

  return { remainingHits, remainingCrits };
};

const findOperative = (session, operativeId) => {
  const teams = Object.values(session.teamsById);
  for (const team of teams) {
    const operative = team.operatives.find((op) => op.id === operativeId);
    if (operative) {
      if (operative.teamId && operative.teamId !== team.id) return null;
      return { team, operative };
    }
  }
  return null;
};

export const getOperative = (session, operativeId) => {
  const found = findOperative(session, operativeId);
  return found?.operative ?? null;
};

const replaceOperative = (session, teamId, operativeId, updater) => {
  const team = session.teamsById[teamId];
  if (!team) return session;

  const nextOperatives = team.operatives.map((op) =>
    op.id === operativeId ? updater(op) : op,
  );

  return {
    ...session,
    teamsById: {
      ...session.teamsById,
      [teamId]: {
        ...team,
        operatives: nextOperatives,
      },
    },
  };
};

const validatePhase = (phase) => PHASE_ORDER.includes(phase);

const isValidOperative = (operative) => {
  if (!operative?.id) return false;
  const stats = operative.base?.stats ?? operative.stats;
  if (!stats) return false;
  const { apl, move, save, woundsMax } = stats;
  if (![apl, move, save, woundsMax].every((value) => value !== undefined)) {
    return false;
  }
  const weapons = operative.weapons ?? operative.base?.weapons;
  if (!Array.isArray(weapons) || weapons.length === 0) return false;
  return true;
};

const isValidTeam = (team) => {
  if (!team?.id) return false;
  if (!Array.isArray(team.operatives) || team.operatives.length === 0) return false;
  return team.operatives.every(isValidOperative);
};

const resetOperativeForStart = (operative) => {
  const stats = operative.base?.stats ?? operative.stats;
  const woundsMax = stats?.woundsMax ?? 0;
  const aplBase = stats?.apl ?? 0;

  return {
    ...operative,
    state: {
      ...operative.state,
      woundsCurrent: woundsMax,
      order: "conceal",
      tokens: [],
      effects: [],
      ready: true,
      expended: false,
      activation: {
        ...operative.state?.activation,
        aplCurrent: aplBase,
        activatedThisRound: false,
      },
    },
  };
};

const resetTeamForStart = (team) => ({
  ...team,
  resources: {
    ...(team.resources || {}),
    cp: 2,
  },
  operatives: team.operatives.map(resetOperativeForStart),
});

const validateEventBasics = (session, event) => {
  if (!event?.id || !event?.t || !event?.type || !event?.actorPlayerId) {
    return false;
  }

  if (!getPlayerById(session, event.actorPlayerId)) {
    return false;
  }

  if (!validatePhase(session.active.phase)) {
    return false;
  }

  const operativeId = event.payload?.operativeId;
  if (operativeId && !findOperative(session, operativeId)) {
    return false;
  }

  return true;
};

const appendEvent = (session, event) => ({
  ...session,
  updatedAt: nowIso(),
  eventLog: [...session.eventLog, event],
});

export const initialSession = ({
  id = generateId(),
  players = [],
  teamsById = {},
  lockedTeams = false,
  currentAttack = null,
  perTurn = {
    ployUsedByPlayerId: {},
    gambitsUsedByPlayerId: {},
  },
  ployState = {
    activeByPlayerId: {},
  },
  counteract = {
    open: false,
    eligiblePlayerId: null,
    selectedOperativeId: null,
    moveBudgetInches: 2,
    moveSpentInches: 0,
    usedOperativeIdsThisTP: [],
    state: "NONE",
  },
  active = {
    turn: 1,
    round: 1,
    turningPoint: 1,
    phase: "SETUP",
    initiativePlayerId: null,
    activePlayerId: null,
    started: false,
    activationSubstep: "NONE",
    activation: {
      operativeId: null,
      aplSpent: 0,
    },
  },
} = {}) => {
  const createdAt = nowIso();
  return {
    id,
    createdAt,
    updatedAt: createdAt,
    players,
    teamsById,
    lockedTeams,
    currentAttack,
    perTurn,
    ployState,
    counteract,
    active,
    eventLog: [],
  };
};

export const applyEvent = (session, event) => {
  if (event?.type === "START_GAME") {
    const { teamA, teamB, missionConfig } = event.payload || {};
    if (session.active?.started) return session;
    if (session.active?.phase !== "SETUP") return session;
    if (!isValidTeam(teamA) || !isValidTeam(teamB)) return session;

    const nextSession = appendEvent(session, event);
    const nextTeamA = resetTeamForStart(teamA);
    const nextTeamB = resetTeamForStart(teamB);

    return {
      ...nextSession,
      teamsById: {
        [nextTeamA.id]: nextTeamA,
        [nextTeamB.id]: nextTeamB,
      },
      lockedTeams: true,
      currentAttack: null,
      missionConfig,
      active: {
        ...nextSession.active,
        turningPoint: 1,
        phase: "SETUP",
        initiativePlayerId: null,
        activationSubstep: "NONE",
        round: 1,
        turn: 1,
        started: true,
        activation: {
          operativeId: null,
          aplSpent: 0,
        },
      },
    };
  }

  if (!validateEventBasics(session, event)) return session;

  let nextSession = appendEvent(session, event);
  const { type, payload } = event;

  switch (type) {
    case "END_TURN": {
      if (nextSession.active.phase !== "FIREFIGHT") return nextSession;
      if (nextSession.active.activation?.operativeId) return nextSession;

      const anyReady = Object.values(nextSession.teamsById).some((team) =>
        team.operatives.some((op) => op.state?.ready === true),
      );
      if (anyReady) return nextSession;

      const allExpended = Object.values(nextSession.teamsById).every((team) =>
        team.operatives.every((op) => op.state?.expended === true),
      );

      if (!allExpended) return nextSession;

      const nextTeamsById = Object.values(nextSession.teamsById).reduce(
        (acc, team) => {
          acc[team.id] = {
            ...team,
            operatives: team.operatives.map(resetEndOfTurnEffects),
          };
          return acc;
        },
        {},
      );

      return {
        ...nextSession,
        teamsById: nextTeamsById,
        ployState: {
          activeByPlayerId: {},
        },
        counteract: {
          open: false,
          eligiblePlayerId: null,
          selectedOperativeId: null,
          moveBudgetInches: 2,
          moveSpentInches: 0,
          usedOperativeIdsThisTP: nextSession.counteract?.usedOperativeIdsThisTP || [],
          state: "NONE",
        },
        active: {
          ...nextSession.active,
          phase: "END_TP",
          counteractForPlayerId: null,
          activationSubstep: "NONE",
          activation: {
            ...nextSession.active.activation,
            operativeId: null,
            aplSpent: 0,
            state: "resolved",
          },
        },
      };
    }
    case "START_TURN": {
      if (!nextSession.active?.started) return nextSession;

      const phase = nextSession.active.phase;
      if (phase !== "SETUP" && phase !== "END_TP") return nextSession;

      const requestedRound = payload?.turningPoint;
      const shouldIncrement = phase === "END_TP";
      const expectedRound = shouldIncrement
        ? (nextSession.active.turningPoint || nextSession.active.round) + 1
        : 1;
      const nextRound = Number.isFinite(requestedRound) ? requestedRound : expectedRound;
      if (nextRound !== expectedRound) return nextSession;

      const initiativePlayerId = nextSession.active.initiativePlayerId;

      const nextTeamsById = Object.values(nextSession.teamsById).reduce(
        (acc, team) => {
          const player = getPlayerByTeamId(nextSession, team.id);
          const isInitiative = player?.id === initiativePlayerId;
          const gain = nextRound > 1 && !isInitiative ? 2 : 1;
          acc[team.id] = {
            ...team,
            resources: {
              ...(team.resources || {}),
              cp: (team.resources?.cp ?? 0) + gain,
            },
            operatives: team.operatives.map((op) => {
              const stats = op.base?.stats ?? op.stats;
              const aplBase = stats?.apl ?? 0;
              return {
                ...op,
                state: {
                  ...op.state,
                  ready: true,
                  expended: false,
                  counteractedThisTP: false,
                  activation: {
                    ...op.state?.activation,
                    aplCurrent: aplBase,
                    activatedThisRound: false,
                  },
                },
              };
            }),
          };
          return acc;
        },
        {},
      );

      const perTurn = {
        ployUsedByPlayerId: {},
        gambitsUsedByPlayerId: {},
      };

      nextSession.players.forEach((player) => {
        if (!player?.id) return;
        perTurn.ployUsedByPlayerId[player.id] = {};
        perTurn.gambitsUsedByPlayerId[player.id] = {};
      });

      return {
        ...nextSession,
        teamsById: nextTeamsById,
        perTurn,
        counteract: {
          open: false,
          eligiblePlayerId: null,
          selectedOperativeId: null,
          moveBudgetInches: 2,
          moveSpentInches: 0,
          usedOperativeIdsThisTP: [],
          state: "NONE",
        },
        active: {
          ...nextSession.active,
          phase: "STRATEGY",
          turningPoint: nextRound,
          round: nextRound,
          activePlayerId: null,
          counteractForPlayerId: null,
          activationSubstep: "NONE",
          activation: {
            ...nextSession.active.activation,
            operativeId: null,
            aplSpent: 0,
          },
        },
      };
    }
    case "SET_INITIATIVE": {
      if (nextSession.active.phase !== "STRATEGY") return nextSession;
      const { initiativePlayerId } = payload || {};
      if (!initiativePlayerId || !getPlayerById(nextSession, initiativePlayerId)) {
        return nextSession;
      }
      const otherPlayerId = getOtherPlayerId(nextSession, initiativePlayerId);
      return {
        ...nextSession,
        active: {
          ...nextSession.active,
          initiativePlayerId,
          activationPriority: otherPlayerId
            ? [initiativePlayerId, otherPlayerId]
            : [initiativePlayerId],
        },
      };
    }

    case "START_FIREFIGHT": {
      if (nextSession.active.phase !== "STRATEGY") return nextSession;
      if (!nextSession.active.initiativePlayerId) return nextSession;

      return {
        ...nextSession,
        active: {
          ...nextSession.active,
          phase: "FIREFIGHT",
          activePlayerId: nextSession.active.initiativePlayerId,
          counteractForPlayerId: null,
          activationSubstep: "NONE",
        },
      };
    }

    case "OPEN_COUNTERACT_WINDOW": {
      const { eligiblePlayerId } = payload || {};
      if (!eligiblePlayerId) return nextSession;
      if (nextSession.active.phase !== "FIREFIGHT") return nextSession;
      if (nextSession.active.activation?.operativeId) return nextSession;

      const expectedPlayerId = nextSession.active.activePlayerId || getExpectedActivePlayerId(nextSession);
      if (expectedPlayerId && expectedPlayerId !== eligiblePlayerId) return nextSession;

      const opponentPlayerId = getOtherPlayerId(nextSession, eligiblePlayerId);
      const eligibleReady = countReadyOperativesForPlayer(nextSession, eligiblePlayerId);
      const opponentReady = opponentPlayerId
        ? countReadyOperativesForPlayer(nextSession, opponentPlayerId)
        : 0;

      if (eligibleReady > 0) return nextSession;
      if (opponentReady <= 0) return nextSession;

      return {
        ...nextSession,
        counteract: {
          open: true,
          eligiblePlayerId,
          selectedOperativeId: null,
          moveBudgetInches: 2,
          moveSpentInches: 0,
          usedOperativeIdsThisTP: nextSession.counteract?.usedOperativeIdsThisTP || [],
          state: "SELECT_OPERATIVE",
        },
      };
    }

    case "DECLARE_COUNTERACT_ACTION": {
      const { playerId, operativeId, action } = payload || {};
      if (!playerId || !operativeId || !action?.type) return nextSession;
      if (nextSession.active.phase !== "FIREFIGHT") return nextSession;
      if (!nextSession.counteract?.open) return nextSession;
      if (nextSession.counteract.state !== "PERFORM_ACTION") return nextSession;
      if (nextSession.counteract.eligiblePlayerId !== playerId) return nextSession;
      if (nextSession.counteract.selectedOperativeId !== operativeId) return nextSession;

      const found = findOperative(nextSession, operativeId);
      if (!found) return nextSession;
      if (found.operative.state?.woundsCurrent <= 0) return nextSession;

      const actionType = String(action.type).toUpperCase();
      if (actionType === "GUARD") return nextSession;
      if (action?.apCost && action.apCost !== 1) return nextSession;
      if (actionType === "SHOOT" && found.operative.state?.order === "conceal") {
        return nextSession;
      }

      const resetMove = actionType === "MOVE" || actionType === "DASH";

      return {
        ...nextSession,
        counteract: {
          ...nextSession.counteract,
          pendingAction: action,
          moveSpentInches: resetMove ? 0 : nextSession.counteract.moveSpentInches,
        },
      };
    }

    case "RESOLVE_COUNTERACT_ACTION": {
      const { playerId, operativeId, resolution } = payload || {};
      if (!playerId || !operativeId) return nextSession;
      if (nextSession.active.phase !== "FIREFIGHT") return nextSession;
      if (!nextSession.counteract?.open) return nextSession;
      if (nextSession.counteract.eligiblePlayerId !== playerId) return nextSession;
      if (nextSession.counteract.selectedOperativeId !== operativeId) return nextSession;
      if (!nextSession.counteract.pendingAction) return nextSession;

      const found = findOperative(nextSession, operativeId);
      if (!found) return nextSession;
      if (found.operative.state?.woundsCurrent <= 0) return nextSession;

      const moveDelta = Number(resolution?.moveInches || 0);
      if (moveDelta < 0) return nextSession;

      const nextMoveSpent = nextSession.counteract.moveSpentInches + moveDelta;
      if (nextMoveSpent > nextSession.counteract.moveBudgetInches) return nextSession;

      const updated = replaceOperative(nextSession, found.team.id, operativeId, (op) => ({
        ...op,
        state: {
          ...op.state,
          counteractedThisTP: true,
        },
      }));

      const opponentPlayerId = getOtherPlayerId(updated, playerId);

      return {
        ...updated,
        counteract: {
          ...updated.counteract,
          open: false,
          eligiblePlayerId: null,
          selectedOperativeId: null,
          pendingAction: null,
          moveSpentInches: nextMoveSpent,
          usedOperativeIdsThisTP: Array.from(
            new Set([
              ...(updated.counteract?.usedOperativeIdsThisTP || []),
              operativeId,
            ]),
          ),
          state: "NONE",
        },
        active: {
          ...updated.active,
          activePlayerId: opponentPlayerId || updated.active.activePlayerId,
        },
      };
    }

    case "SKIP_COUNTERACT": {
      const { playerId } = payload || {};
      if (!playerId) return nextSession;
      if (nextSession.active.phase !== "FIREFIGHT") return nextSession;
      if (!nextSession.counteract?.open) return nextSession;
      if (nextSession.counteract.eligiblePlayerId !== playerId) return nextSession;

      const opponentPlayerId = getOtherPlayerId(nextSession, playerId);

      return {
        ...nextSession,
        counteract: {
          ...nextSession.counteract,
          open: false,
          eligiblePlayerId: null,
          selectedOperativeId: null,
          pendingAction: null,
          state: "NONE",
        },
        active: {
          ...nextSession.active,
          activePlayerId: opponentPlayerId || nextSession.active.activePlayerId,
        },
      };
    }

    case "SET_ACTIVE_OPERATIVE": {
      const { operativeId } = payload || {};
      if (!operativeId) return nextSession;

      if (nextSession.active.phase !== "FIREFIGHT") return nextSession;

      if (nextSession.active.activation?.operativeId) return nextSession;

      const found = findOperative(nextSession, operativeId);
      if (!found) return nextSession;
      const { team, operative } = found;

      const ownerPlayer = getPlayerByTeamId(nextSession, team.id);
      if (!ownerPlayer?.id) return nextSession;

      const expectedPlayerId = nextSession.active.activePlayerId || getExpectedActivePlayerId(nextSession);
      if (expectedPlayerId && ownerPlayer.id !== expectedPlayerId) return nextSession;

      if (operative.state?.ready === false) return nextSession;
      if (operative.state?.activation?.activatedThisRound) return nextSession;
      if (operative.state?.woundsCurrent <= 0) return nextSession;

      const stats = operative.base?.stats ?? operative.stats;
      const aplBase = stats?.apl ?? 0;
      const aplCurrent = operative.state?.activation?.aplCurrent ?? aplBase;

      return {
        ...nextSession,
        active: {
          ...nextSession.active,
          activePlayerId: ownerPlayer.id,
          activationSubstep: "DETERMINE_ORDER",
          activation: {
            ...nextSession.active.activation,
            operativeId,
            state: "determine_order",
          },
        },
        teamsById: {
          ...nextSession.teamsById,
          [team.id]: {
            ...team,
            operatives: team.operatives.map((op) =>
              op.id === operativeId
                ? {
                    ...op,
                    state: {
                      ...op.state,
                      activation: {
                        ...op.state.activation,
                        aplCurrent,
                      },
                    },
                  }
                : op,
            ),
          },
        },
      };
    }
    case "SET_ORDER": {
      const { operativeId, order } = payload || {};
      if (!operativeId || (order !== "conceal" && order !== "engage")) return nextSession;
      if (nextSession.active.phase !== "FIREFIGHT") return nextSession;
      if (nextSession.active.activation?.operativeId !== operativeId) return nextSession;
      if (nextSession.active.activationSubstep !== "DETERMINE_ORDER") return nextSession;
      const found = findOperative(nextSession, operativeId);
      if (!found) return nextSession;
      if (found.operative.state?.woundsCurrent <= 0) return nextSession;

      const updated = replaceOperative(nextSession, found.team.id, operativeId, (op) => ({
        ...op,
        state: { ...op.state, order },
      }));

      return {
        ...updated,
        active: {
          ...updated.active,
          activationSubstep: "PERFORM_ACTIONS",
          activation: {
            ...updated.active.activation,
            state: "perform_actions",
          },
        },
      };
    }

    case "APPLY_DAMAGE": {
      const { operativeId, amount } = payload || {};
      if (!operativeId || !Number.isFinite(amount) || amount <= 0) return nextSession;
      const found = findOperative(nextSession, operativeId);
      if (!found) return nextSession;
      if (found.operative.state?.incapacitated) return nextSession;

      return replaceOperative(nextSession, found.team.id, operativeId, (op) => {
        const current = op.state?.woundsCurrent ?? 0;
        const nextWounds = current - amount;
        return applyWoundsOverride(op, nextWounds);
      });
    }

    case "HEAL": {
      const { operativeId, amount } = payload || {};
      if (!operativeId || !Number.isFinite(amount) || amount <= 0) return nextSession;
      const found = findOperative(nextSession, operativeId);
      if (!found) return nextSession;
      if (found.operative.state?.incapacitated) return nextSession;

      return replaceOperative(nextSession, found.team.id, operativeId, (op) => {
        const current = op.state?.woundsCurrent ?? 0;
        const nextWounds = current + amount;
        return applyWoundsOverride(op, nextWounds);
      });
    }

    case "SET_WOUNDS": {
      const { operativeId, woundsCurrent } = payload || {};
      if (!operativeId || !Number.isFinite(woundsCurrent)) return nextSession;
      const found = findOperative(nextSession, operativeId);
      if (!found) return nextSession;
      const updated = replaceOperative(nextSession, found.team.id, operativeId, (op) =>
        applyWoundsOverride(op, woundsCurrent),
      );

      const isIncapacitated = woundsCurrent <= 0;
      if (!isIncapacitated) return updated;

      const isActive = updated.active.activation?.operativeId === operativeId;
      if (!isActive) return updated;

      return {
        ...updated,
        active: {
          ...updated.active,
          activationSubstep: "NONE",
          activation: {
            ...updated.active.activation,
            operativeId: null,
            aplSpent: 0,
            state: "resolved",
          },
        },
      };
    }

    case "SET_INJURED": {
      const { operativeId, injured } = payload || {};
      if (!operativeId || typeof injured !== "boolean") return nextSession;
      const found = findOperative(nextSession, operativeId);
      if (!found) return nextSession;
      if (found.operative.state?.incapacitated) return nextSession;

      return replaceOperative(nextSession, found.team.id, operativeId, (op) => ({
        ...op,
        state: {
          ...op.state,
          injuredOverride: injured,
        },
      }));
    }

    case "DECLARE_ATTACK": {
      const { attackerId, defenderId, weaponId, attackType } = payload || {};
      if (!attackerId || !defenderId || !weaponId) return nextSession;
      if (attackType !== "shoot" && attackType !== "fight") return nextSession;

      if (nextSession.active.activation?.operativeId !== attackerId) return nextSession;
      if (nextSession.active.phase !== "FIREFIGHT") return nextSession;
      if (nextSession.active.activationSubstep !== "PERFORM_ACTIONS") return nextSession;
      if (nextSession.currentAttack) return nextSession;

      const attackerFound = findOperative(nextSession, attackerId);
      const defenderFound = findOperative(nextSession, defenderId);
      if (!attackerFound || !defenderFound) return nextSession;

      const attacker = attackerFound.operative;
      const defender = defenderFound.operative;

      if (attacker.state?.woundsCurrent <= 0) return nextSession;
      if (defender.state?.woundsCurrent <= 0) return nextSession;

      const weapon = attacker.weapons?.find((w) => w.id === weaponId);
      if (!weapon) return nextSession;

      if (
        attackType === "shoot" &&
        attacker.state?.order === "conceal" &&
        !weaponHasRule(weapon, "silent")
      ) {
        return nextSession;
      }

      const stats = attacker.base?.stats ?? attacker.stats;
      const aplCurrent = attacker.state?.activation?.aplCurrent ?? stats?.apl ?? 0;
      if (aplCurrent < 1) return nextSession;

      const updated = replaceOperative(nextSession, attackerFound.team.id, attackerId, (op) => ({
        ...op,
        state: {
          ...op.state,
          activation: {
            ...op.state.activation,
            aplCurrent: Math.max(0, aplCurrent - 1),
          },
        },
      }));

      return {
        ...updated,
        currentAttack: {
          attackId: generateId(),
          attackerId,
          defenderId,
          weaponId,
          attackType,
          attackDice: { hits: 0, crits: 0 },
          defenseDice: { saves: 0, critSaves: 0 },
          state: "AWAIT_ATTACK_ROLLS",
          status: "AWAIT_ATTACK_ROLLS",
        },
      };
    }

    case "USE_PLOY": {
      const { playerId, ployId, timingTag, timing, cost = 1, effectTiming } = payload || {};
      if (!playerId || !ployId) return nextSession;

      const team = getTeamByPlayerId(nextSession, playerId);
      if (!team) return nextSession;

      const currentCp = team.resources?.cp ?? 0;
      if (!Number.isFinite(cost) || cost <= 0 || currentCp < cost) return nextSession;

      const phase = nextSession.active.phase;
      const timingValue = timingTag || timing || "";
      if (timingValue === "STRATEGY" && phase !== "STRATEGY") return nextSession;
      if (timingValue === "FIREFIGHT" && phase !== "FIREFIGHT") return nextSession;

      const normalizedPloyId = String(ployId).toLowerCase().replace(/\s+/g, "_");
      const isCommandReroll = normalizedPloyId === "command_reroll";

      const usedByPlayer = nextSession.perTurn?.ployUsedByPlayerId?.[playerId] || {};
      if (!isCommandReroll && usedByPlayer[ployId]) return nextSession;

      const nextTeamsById = {
        ...nextSession.teamsById,
        [team.id]: {
          ...team,
          resources: {
            ...(team.resources || {}),
            cp: currentCp - cost,
          },
        },
      };

      const nextPerTurn = {
        ployUsedByPlayerId: {
          ...(nextSession.perTurn?.ployUsedByPlayerId || {}),
          [playerId]: {
            ...usedByPlayer,
            ...(isCommandReroll ? {} : { [ployId]: true }),
          },
        },
        gambitsUsedByPlayerId: {
          ...(nextSession.perTurn?.gambitsUsedByPlayerId || {}),
        },
      };

      const nextPloyState = {
        activeByPlayerId: {
          ...(nextSession.ployState?.activeByPlayerId || {}),
        },
      };

      if (effectTiming === "end_tp" || timingValue === "until_end_tp") {
        const existing = nextPloyState.activeByPlayerId[playerId] || [];
        nextPloyState.activeByPlayerId[playerId] = [
          ...existing,
          { ployId, timingTag: timingValue, expires: "endOfTurn" },
        ];
      }

      return {
        ...nextSession,
        teamsById: nextTeamsById,
        perTurn: nextPerTurn,
        ployState: nextPloyState,
      };
    }

    case "GAIN_CP": {
      const { playerId, amount, reason } = payload || {};
      if (!playerId || !Number.isFinite(amount) || amount <= 0) return nextSession;
      const team = getTeamByPlayerId(nextSession, playerId);
      if (!team) return nextSession;

      return {
        ...nextSession,
        teamsById: {
          ...nextSession.teamsById,
          [team.id]: {
            ...team,
            resources: {
              ...(team.resources || {}),
              cp: (team.resources?.cp ?? 0) + amount,
            },
            notes: {
              ...(team.notes || {}),
              lastCpGain: {
                amount,
                reason: reason || "",
                at: nowIso(),
              },
            },
          },
        },
      };
    }

    case "SPEND_CP": {
      const { playerId, amount, reason } = payload || {};
      if (!playerId || !Number.isFinite(amount) || amount <= 0) return nextSession;
      const team = getTeamByPlayerId(nextSession, playerId);
      if (!team) return nextSession;

      const currentCp = team.resources?.cp ?? 0;
      if (currentCp < amount) return nextSession;

      return {
        ...nextSession,
        teamsById: {
          ...nextSession.teamsById,
          [team.id]: {
            ...team,
            resources: {
              ...(team.resources || {}),
              cp: currentCp - amount,
            },
            notes: {
              ...(team.notes || {}),
              lastCpSpend: {
                amount,
                reason: reason || "",
                at: nowIso(),
              },
            },
          },
        },
      };
    }

    case "ENTER_ATTACK_ROLLS": {
      const { attackId, hits, crits } = payload || {};
      if (!nextSession.currentAttack) return nextSession;
      if (nextSession.currentAttack.state !== "AWAIT_ATTACK_ROLLS") return nextSession;
      if (attackId && nextSession.currentAttack.attackId !== attackId) return nextSession;
      if (!Number.isFinite(hits) || !Number.isFinite(crits)) return nextSession;
      if (hits < 0 || crits < 0) return nextSession;

      return {
        ...nextSession,
        currentAttack: {
          ...nextSession.currentAttack,
          attackDice: {
            hits,
            crits,
          },
          state: "AWAIT_DEFENCE_ROLLS",
          status: "AWAIT_DEFENCE_ROLLS",
        },
      };
    }

    case "ENTER_DEFENCE_ROLLS": {
      const { attackId, saves, critSaves = 0 } = payload || {};
      if (!nextSession.currentAttack) return nextSession;
      if (nextSession.currentAttack.state !== "AWAIT_DEFENCE_ROLLS") return nextSession;
      if (attackId && nextSession.currentAttack.attackId !== attackId) return nextSession;
      if (!Number.isFinite(saves) || !Number.isFinite(critSaves)) return nextSession;
      if (saves < 0 || critSaves < 0) return nextSession;

      return {
        ...nextSession,
        currentAttack: {
          ...nextSession.currentAttack,
          defenseDice: {
            saves,
            critSaves,
          },
          state: "READY_TO_RESOLVE",
          status: "READY_TO_RESOLVE",
        },
      };
    }

    case "RESOLVE_ATTACK": {
      if (!nextSession.currentAttack) return nextSession;
      if (nextSession.currentAttack.state !== "READY_TO_RESOLVE") return nextSession;

      const { attackId } = payload || {};
      if (attackId && nextSession.currentAttack.attackId !== attackId) return nextSession;

      const { attackerId, defenderId, weaponId } = nextSession.currentAttack;
      const attackerFound = findOperative(nextSession, attackerId);
      const defenderFound = findOperative(nextSession, defenderId);

      if (!attackerFound || !defenderFound) {
        return {
          ...nextSession,
          currentAttack: null,
        };
      }

      const attacker = attackerFound.operative;
      const defender = defenderFound.operative;
      if (!attacker || !defender || defender.state?.woundsCurrent <= 0) {
        return {
          ...nextSession,
          currentAttack: null,
        };
      }

      const weapon = attacker.weapons?.find((w) => w.id === weaponId);
      if (!weapon) {
        return {
          ...nextSession,
          currentAttack: null,
        };
      }

      const { hits, crits } = nextSession.currentAttack.attackDice || {
        hits: 0,
        crits: 0,
      };
      const { saves, critSaves } = nextSession.currentAttack.defenseDice || {
        saves: 0,
        critSaves: 0,
      };

      const remainingCritsAfterCritSaves = Math.max(crits - critSaves, 0);
      const critSavesLeft = Math.max(critSaves - crits, 0);
      const remainingHitsAfterCritSaves = Math.max(hits - critSavesLeft, 0);
      const remainingHits = Math.max(remainingHitsAfterCritSaves - saves, 0);
      const remainingCrits = remainingCritsAfterCritSaves;

      const damageProfile = parseWeaponDamage(weapon);
      const totalDamage =
        remainingHits * damageProfile.normal + remainingCrits * damageProfile.crit;

      const updated = replaceOperative(nextSession, defenderFound.team.id, defenderId, (op) =>
        totalDamage > 0 ? applyWoundsOverride(op, (op.state?.woundsCurrent ?? 0) - totalDamage) : op,
      );

      return {
        ...updated,
        currentAttack: null,
      };
    }

    case "ADD_TOKEN": {
      const { operativeId, token } = payload || {};
      if (!operativeId || !token?.type) return nextSession;
      const found = findOperative(nextSession, operativeId);
      if (!found) return nextSession;
      return replaceOperative(nextSession, found.team.id, operativeId, (op) => ({
        ...op,
        state: {
          ...op.state,
          tokens: [...op.state.tokens, token],
        },
      }));
    }

    case "REMOVE_TOKEN": {
      const { operativeId, tokenType } = payload || {};
      if (!operativeId || !tokenType) return nextSession;
      const found = findOperative(nextSession, operativeId);
      if (!found) return nextSession;
      return replaceOperative(nextSession, found.team.id, operativeId, (op) => ({
        ...op,
        state: {
          ...op.state,
          tokens: op.state.tokens.filter((t) => t.type !== tokenType),
        },
      }));
    }

    case "TOGGLE_TOKEN": {
      const { operativeId, tokenKey } = payload || {};
      if (!operativeId || !tokenKey) return nextSession;
      const found = findOperative(nextSession, operativeId);
      if (!found) return nextSession;
      if (found.operative.state?.woundsCurrent <= 0) return nextSession;

      const existingTokens = Array.isArray(found.operative.state?.tokens)
        ? found.operative.state.tokens
        : [];
      const normalizedKey = String(tokenKey);
      const hasToken = existingTokens.some((t) => t.type === normalizedKey);
      const nextTokens = hasToken
        ? existingTokens.filter((t) => t.type !== normalizedKey)
        : [
            ...existingTokens,
            { type: normalizedKey, expires: { when: "END_TP" } },
          ];

      return replaceOperative(nextSession, found.team.id, operativeId, (op) =>
        updateDerivedForTokenToggle(
          {
            ...op,
            state: {
              ...op.state,
              tokens: nextTokens,
            },
          },
          normalizedKey,
          !hasToken,
        ),
      );
    }

    case "SELECT_OPERATIVE": {
      const { operativeId } = payload || {};
      if (!operativeId) return nextSession;
      return {
        ...nextSession,
        players: nextSession.players.map((player) =>
          player.id === event.actorPlayerId
            ? {
                ...player,
                ui: { ...(player.ui || {}), selectedOperativeId: operativeId },
              }
            : player,
        ),
      };
    }

    case "SELECT_WEAPON": {
      const { operativeId, weaponId } = payload || {};
      if (!operativeId) return nextSession;
      const found = findOperative(nextSession, operativeId);
      if (!found) return nextSession;
      return replaceOperative(nextSession, found.team.id, operativeId, (op) => ({
        ...op,
        state: {
          ...op.state,
          selectedWeaponId: weaponId ?? null,
        },
      }));
    }

    case "SPEND_APL": {
      const { operativeId, amount = 0 } = payload || {};
      if (!operativeId || !Number.isFinite(amount) || amount <= 0) return nextSession;
      const found = findOperative(nextSession, operativeId);
      if (!found) return nextSession;
      const updated = replaceOperative(nextSession, found.team.id, operativeId, (op) => ({
        ...op,
        state: {
          ...op.state,
          activation: {
            ...op.state.activation,
            aplCurrent: clamp(op.state.activation.aplCurrent - amount, 0, op.base.stats.apl),
          },
        },
      }));

      return {
        ...updated,
        active: {
          ...updated.active,
          activation: {
            ...updated.active.activation,
            operativeId: operativeId,
            aplSpent: updated.active.activation.aplSpent + amount,
          },
        },
      };
    }

    case "END_ACTIVATION": {
      if (nextSession.active.phase !== "FIREFIGHT") return nextSession;
      if (nextSession.currentAttack) return nextSession;
      const operativeId = nextSession.active.activation?.operativeId;
      if (!operativeId) return nextSession;
      const found = findOperative(nextSession, operativeId);
      if (!found) return nextSession;

      const ownerPlayer = getPlayerByTeamId(nextSession, found.team.id);
      const ownerPlayerId = ownerPlayer?.id || nextSession.active.activePlayerId;
      if (!ownerPlayerId) return nextSession;

      const updated = replaceOperative(nextSession, found.team.id, operativeId, (op) => ({
        ...op,
        state: {
          ...op.state,
          ready: false,
          expended: true,
          activation: {
            ...op.state.activation,
            aplCurrent: 0,
            activatedThisRound: true,
          },
        },
      }));

      const opponentPlayerId = getOtherPlayerId(updated, ownerPlayerId);
      const opponentReady = opponentPlayerId
        ? countReadyOperativesForPlayer(updated, opponentPlayerId)
        : 0;
      const ownerReady = countReadyOperativesForPlayer(updated, ownerPlayerId);

      const nextActivePlayerId =
        opponentReady > 0
          ? opponentPlayerId
          : ownerReady > 0
            ? ownerPlayerId
            : ownerPlayerId;

      const nextReady = countReadyOperativesForPlayer(updated, nextActivePlayerId);
      const nextOpponentId = getOtherPlayerId(updated, nextActivePlayerId);
      const nextOpponentReady = nextOpponentId
        ? countReadyOperativesForPlayer(updated, nextOpponentId)
        : 0;

      const eligiblePlayerId =
        nextReady === 0 && nextOpponentReady > 0 ? nextActivePlayerId : null;
      const eligibleTeam = eligiblePlayerId
        ? getTeamByPlayerId(updated, eligiblePlayerId)
        : null;

      const hasCounteractEligible = eligibleTeam
        ? eligibleTeam.operatives.some(
            (op) =>
              op.state?.expended === true &&
              op.state?.order === "engage" &&
              !op.state?.counteractedThisTP &&
              op.state?.woundsCurrent > 0,
          )
        : false;

      return {
        ...updated,
        counteract: {
          open: Boolean(eligiblePlayerId && hasCounteractEligible),
          eligiblePlayerId: eligiblePlayerId && hasCounteractEligible ? eligiblePlayerId : null,
          selectedOperativeId: null,
          moveBudgetInches: 2,
          moveSpentInches: 0,
          usedOperativeIdsThisTP: updated.counteract?.usedOperativeIdsThisTP || [],
          state: eligiblePlayerId && hasCounteractEligible ? "SELECT_OPERATIVE" : "NONE",
        },
        active: {
          ...updated.active,
          turn: (updated.active.turn || 1) + 1,
          activePlayerId: nextActivePlayerId,
          counteractForPlayerId: eligiblePlayerId && hasCounteractEligible ? eligiblePlayerId : null,
          activationSubstep: "NONE",
          activation: {
            operativeId: null,
            aplSpent: 0,
            state: "resolved",
          },
        },
      };
    }

    case "NEXT_PHASE": {
      const { phase } = payload || {};
      const currentIndex = PHASE_ORDER.indexOf(nextSession.active.phase);
      const nextPhase = validatePhase(phase)
        ? phase
        : PHASE_ORDER[Math.max(0, Math.min(PHASE_ORDER.length - 1, currentIndex + 1))];
      return {
        ...nextSession,
        active: {
          ...nextSession.active,
          phase: nextPhase,
        },
      };
    }

    case "NEXT_ROUND": {
      const { round } = payload || {};
      return {
        ...nextSession,
        active: {
          ...nextSession.active,
          round: Number.isFinite(round) ? round : nextSession.active.round + 1,
          turningPoint: Number.isFinite(round)
            ? round
            : (nextSession.active.turningPoint || nextSession.active.round) + 1,
          turn: 1,
          phase: "STRATEGY",
          activationSubstep: "NONE",
          activation: {
            operativeId: null,
            aplSpent: 0,
          },
        },
      };
    }

    default:
      return nextSession;
  }
};

export const dispatchEvent = (session, actorPlayerId, type, payload = {}) => {
  const event = {
    id: generateId(),
    t: nowIso(),
    type,
    actorPlayerId,
    payload,
  };

  return applyEvent(session, event);
};

export const replay = (eventLog, seed = initialSession()) =>
  eventLog.reduce((nextSession, event) => applyEvent(nextSession, event), seed);

export const buildDerivedCache = (session) => {
  const operatives = Object.values(session.teamsById).flatMap(
    (team) => team.operatives,
  );

  const operativeStatus = operatives.reduce((acc, operative) => {
    const woundsMax = operative.base.stats.woundsMax;
    const woundsCurrent = operative.state.woundsCurrent;
    const aplBase = operative.base.stats.apl;
    const aplCurrent = operative.state.activation.aplCurrent;

    acc[operative.id] = {
      isInjured: woundsCurrent < woundsMax / 2,
      isDead: woundsCurrent <= 0,
      aplAvailable: clamp(aplCurrent, 0, aplBase),
    };

    return acc;
  }, {});

  return {
    operativeStatus,
    computedAt: nowIso(),
  };
};

export const withDerivedCache = (session) => ({
  ...session,
  derivedCache: buildDerivedCache(session),
});
