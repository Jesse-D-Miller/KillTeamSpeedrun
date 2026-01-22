const PHASE_ORDER = ["strategy", "firefight", "end"];

const generateId = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const nowIso = () => new Date().toISOString();

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const getPlayerById = (session, playerId) =>
  session.players.find((player) => player.id === playerId) || null;

const getOtherPlayerId = (session, playerId) =>
  session.players.find((player) => player.id !== playerId)?.id || "";

const getPlayerByTeamId = (session, teamId) =>
  session.players.find((player) => player.selectedTeamId === teamId) || null;

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
      ? operative.state.tokens.filter((token) => token?.expires?.when !== "endOfRound")
      : [],
  },
});

const updateDerivedForTokenToggle = (operative, tokenKey, hasToken) => {
  if (!tokenKey) return operative;
  const blockedCounteract = tokenKey === "guard" && hasToken;
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
      activation: {
        ...operative.state?.activation,
        activatedThisRound: incapacitated
          ? true
          : operative.state?.activation?.activatedThisRound ?? false,
      },
    },
  };
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
    cp: 0,
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
  active = {
    turn: 1,
    round: 1,
    phase: "strategy",
    initiativePlayerId: players[0]?.id || "",
    activePlayerId: players[0]?.id || "",
    started: false,
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
    active,
    eventLog: [],
  };
};

export const applyEvent = (session, event) => {
  if (event?.type === "START_GAME") {
    const { teamA, teamB, missionConfig } = event.payload || {};
    if (session.active?.started) return session;
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
        phase: "strategy",
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
      if (nextSession.active.activation?.operativeId) return nextSession;

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
        active: {
          ...nextSession.active,
          phase: "end",
          counteractForPlayerId: null,
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

      const requestedRound = payload?.turningPointNumber;
      const shouldIncrement = nextSession.active.phase === "end";
      const nextRound = Number.isFinite(requestedRound)
        ? requestedRound
        : shouldIncrement
          ? nextSession.active.round + 1
          : Math.max(1, nextSession.active.round || 1);

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
        active: {
          ...nextSession.active,
          phase: "strategy",
          round: nextRound,
        },
      };
    }
    case "SET_INITIATIVE": {
      if (nextSession.active.phase !== "strategy") return nextSession;
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

    case "SET_ACTIVE_OPERATIVE": {
      const { operativeId } = payload || {};
      if (!operativeId) return nextSession;

      if (nextSession.active.phase !== "firefight") return nextSession;

      const found = findOperative(nextSession, operativeId);
      if (!found) return nextSession;
      const { team, operative } = found;

      const ownerPlayer = getPlayerByTeamId(nextSession, team.id);
      if (!ownerPlayer?.id) return nextSession;

      const expectedPlayerId = getExpectedActivePlayerId(nextSession);
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
      if (nextSession.active.activation?.operativeId !== operativeId) return nextSession;
      if (nextSession.active.activation?.state !== "determine_order") return nextSession;
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
      return replaceOperative(nextSession, found.team.id, operativeId, (op) => {
        const nextWounds = clamp(
          op.state.woundsCurrent - amount,
          0,
          op.base.stats.woundsMax,
        );
        return {
          ...op,
          state: {
            ...op.state,
            woundsCurrent: nextWounds,
            activation: {
              ...op.state.activation,
              activatedThisRound:
                nextWounds <= 0 ? true : op.state.activation.activatedThisRound,
            },
          },
        };
      });
    }

    case "HEAL": {
      const { operativeId, amount } = payload || {};
      if (!operativeId || !Number.isFinite(amount) || amount <= 0) return nextSession;
      const found = findOperative(nextSession, operativeId);
      if (!found) return nextSession;
      return replaceOperative(nextSession, found.team.id, operativeId, (op) => {
        const nextWounds = clamp(
          op.state.woundsCurrent + amount,
          0,
          op.base.stats.woundsMax,
        );
        return {
          ...op,
          state: {
            ...op.state,
            woundsCurrent: nextWounds,
          },
        };
      });
    }

    case "SET_WOUNDS": {
      const { operativeId, woundsCurrent } = payload || {};
      if (!operativeId || !Number.isFinite(woundsCurrent)) return nextSession;
      const found = findOperative(nextSession, operativeId);
      if (!found) return nextSession;
      return replaceOperative(nextSession, found.team.id, operativeId, (op) =>
        applyWoundsOverride(op, woundsCurrent),
      );
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
      const hasToken = existingTokens.some((t) => t.type === tokenKey);
      const nextTokens = hasToken
        ? existingTokens.filter((t) => t.type !== tokenKey)
        : [...existingTokens, { type: tokenKey, expires: { when: "endOfRound" } }];

      return replaceOperative(nextSession, found.team.id, operativeId, (op) =>
        updateDerivedForTokenToggle(
          {
            ...op,
            state: {
              ...op.state,
              tokens: nextTokens,
            },
          },
          tokenKey,
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

      const counteractForPlayerId =
        opponentReady === 0 && ownerReady > 0 && opponentPlayerId
          ? opponentPlayerId
          : null;

      return {
        ...updated,
        active: {
          ...updated.active,
          turn: (updated.active.turn || 1) + 1,
          activePlayerId: nextActivePlayerId,
          counteractForPlayerId,
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
          turn: 1,
          phase: "strategy",
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
