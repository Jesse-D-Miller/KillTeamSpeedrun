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
  active = {
    turn: 1,
    round: 1,
    phase: "strategy",
    initiativePlayerId: players[0]?.id || "",
    activePlayerId: players[0]?.id || "",
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
    active,
    eventLog: [],
  };
};

export const applyEvent = (session, event) => {
  if (!validateEventBasics(session, event)) return session;

  let nextSession = appendEvent(session, event);
  const { type, payload } = event;

  switch (type) {
    case "SET_ORDER": {
      const { operativeId, order } = payload || {};
      if (!operativeId || (order !== "conceal" && order !== "engage")) return nextSession;
      const found = findOperative(nextSession, operativeId);
      if (!found) return nextSession;
      return replaceOperative(nextSession, found.team.id, operativeId, (op) => ({
        ...op,
        state: { ...op.state, order },
      }));
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
      const { operativeId } = payload || {};
      if (!operativeId) return nextSession;
      const found = findOperative(nextSession, operativeId);
      if (!found) return nextSession;
      const updated = replaceOperative(nextSession, found.team.id, operativeId, (op) => ({
        ...op,
        state: {
          ...op.state,
          activation: {
            ...op.state.activation,
            activatedThisRound: true,
          },
        },
      }));
      return {
        ...updated,
        active: {
          ...updated.active,
          activation: {
            operativeId: null,
            aplSpent: 0,
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
