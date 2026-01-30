import "./App.css";
import UnitCard from "./ui/components/UnitCard";
import TopBar from "./ui/components/TopBar";
import LogNotice from "./ui/components/LogNotice";
import AttackResolutionScreen from "./ui/screens/AttackResolutionScreen";
import WeaponSelectModal from "./ui/components/WeaponSelectModal";
import ArmySelector from "./ui/screens/ArmySelector";
import UnitSelector from "./ui/screens/UnitSelector";
import MultiplayerLobby from "./ui/screens/MultiplayerLobby";
import UnitCardFocused from "./ui/screens/UnitCardFocused";
import StrategyPhase from "./ui/screens/StrategyPhase";
import TurningPointEnd from "./ui/screens/TurningPointEnd";
import TargetSelectScreen from "./ui/screens/TargetSelectScreen";
import seedGameState from "./e2e/seedGameState.json";
import {
  gameReducer,
  initialCombatState,
  COMBAT_STAGES,
} from "./state/gameReducer";
import { resolveAttack } from "./engine/rules/resolveAttack";
import {
  normalizeWeaponRules,
  runWeaponRuleHook,
} from "./engine/rules/weaponRules";
import {
  canCounteract,
  getCounteractCandidates,
  getReadyOperatives,
  isInCounteractWindow,
} from "./state/gameLoopSelectors";
import { ACTION_CONFIG } from "./engine/rules/actionsCore";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { connectWS } from "./lib/multiplayer";
import { getOrCreatePlayerId } from "./lib/playerIdentity";
import { validateGameIntent } from "./state/intentGate";

const killteamModules = import.meta.glob("./data/killteams/*.json", {
  eager: true,
});

function getArmyKey(filePath) {
  const file = filePath.split("/").pop() || "";
  return file.replace(".json", "");
}

function normalizeKillteamData(moduleData) {
  if (Array.isArray(moduleData)) return moduleData;
  if (Array.isArray(moduleData?.default)) return moduleData.default;
  return [];
}

function normalizeWeaponRulesList(wr) {
  if (!wr || wr === "-") return [];
  return Array.isArray(wr) ? wr : [wr];
}

function pipIndicesForValue(value) {
  const numeric = Number(value);
  switch (numeric) {
    case 1:
      return [4];
    case 2:
      return [0, 8];
    case 3:
      return [0, 4, 8];
    case 4:
      return [0, 2, 6, 8];
    case 5:
      return [0, 2, 4, 6, 8];
    case 6:
      return [0, 2, 3, 5, 6, 8];
    default:
      return [];
  }
}

function buildRemainingDiceFromCounts(remaining = {}) {
  const crits = Math.max(0, Number(remaining?.crit ?? 0));
  const norms = Math.max(0, Number(remaining?.norm ?? 0));
  return [
    ...Array.from({ length: crits }, () => 6),
    ...Array.from({ length: norms }, () => 4),
  ];
}

function buildFightDiceEntries(raw = [], hitThreshold = 6, remaining = {}) {
  const critThreshold = 6;
  const entries = raw.map((value, index) => {
    const numeric = Number(value);
    const isCrit = Number.isFinite(numeric) && numeric >= critThreshold;
    const isHit =
      Number.isFinite(numeric) && numeric >= hitThreshold && numeric < critThreshold;
    const isMiss = !isCrit && !isHit;
    const dieType = isCrit ? "crit" : isHit ? "norm" : "miss";
    return {
      id: `${index}-${numeric}`,
      value: numeric,
      dieType,
      typeClass: isCrit ? "crit" : isHit ? "hit" : "miss",
      isMiss,
      used: false,
      index,
    };
  });

  const totalCrit = entries.filter((e) => e.dieType === "crit").length;
  const totalNorm = entries.filter((e) => e.dieType === "norm").length;
  const usedCrit = Math.max(0, totalCrit - Number(remaining?.crit ?? 0));
  const usedNorm = Math.max(0, totalNorm - Number(remaining?.norm ?? 0));

  const markUsed = (type, count) => {
    if (count <= 0) return;
    const indices = entries
      .filter((e) => e.dieType === type)
      .map((e) => e.index)
      .reverse();
    indices.slice(0, count).forEach((idx) => {
      const entry = entries.find((e) => e.index === idx);
      if (entry) entry.used = true;
    });
  };

  markUsed("crit", usedCrit);
  markUsed("norm", usedNorm);

  const orderRank = (entry) => {
    if (entry.used) return 2;
    if (entry.isMiss) return 1;
    return 0;
  };

  return [...entries].sort((a, b) => {
    const rankA = orderRank(a);
    const rankB = orderRank(b);
    if (rankA !== rankB) return rankA - rankB;
    return a.index - b.index;
  });
}

function generateClientId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isE2EUrl() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("e2e") === "1";
}

function isE2E() {
  if (typeof window === "undefined") return false;
  if (isE2EUrl()) return true;
  return (
    Array.isArray(window.__ktE2E_gameEvents) ||
    Array.isArray(window.__ktE2E_combatEvents)
  );
}

const armies = Object.entries(killteamModules).map(([path, data]) => ({
  key: getArmyKey(path),
  name: getArmyKey(path).replace(/[-_]+/g, " "),
  units: normalizeKillteamData(data),
}));

function GameOverlay({ initialUnits, playerSlot, gameCode, teamKeys, renderUi = true }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { username } = useParams();
  const buildInitialState = useCallback(() => ({
    gameId: generateClientId(),
    appliedEventIds: new Set(),
    phase: "SETUP",
    turningPoint: 0,
    topBar: {
      initiativePlayerId: null,
    },
    cp: { A: 0, B: 0 },
    endedAt: null,
    winner: null,
    setup: {
      teamsLocked: false,
      deploymentComplete: false,
    },
    strategy: {
      passed: { A: false, B: false },
      usedStrategicGambits: { A: [], B: [] },
      turn: null,
      activeChooserPlayerId: null,
      passedByPlayer: { A: false, B: false },
      usedPloyIdsByPlayer: { A: [], B: [] },
      lastAction: null,
      cpAwardedForTP: null,
      decisions: [],
      cpGrantedThisTP: false,
      operativesReadiedThisTP: false,
    },
    firefight: {
      activeOperativeId: null,
      activePlayerId: null,
      orderChosenThisActivation: false,
      awaitingOrder: false,
      awaitingActions: false,
    },
    game: initialUnits,
    log: {
      entries: [],
      cursor: 0,
    },
    weaponUsage: {},
    combatState: initialCombatState,
    ui: {
      actionFlow: null,
    },
  }), [initialUnits]);

  const buildSeedState = useCallback(
    (seedOverride = seedGameState) => {
      const base = buildInitialState();
      const seed = seedOverride && typeof seedOverride === "object" ? seedOverride : {};
      const merged = {
        ...base,
        ...seed,
        topBar: { ...(base.topBar || {}), ...(seed.topBar || {}) },
        setup: { ...(base.setup || {}), ...(seed.setup || {}) },
        strategy: { ...(base.strategy || {}), ...(seed.strategy || {}) },
        firefight: { ...(base.firefight || {}), ...(seed.firefight || {}) },
        log: { ...(base.log || {}), ...(seed.log || {}) },
        weaponUsage: { ...(base.weaponUsage || {}), ...(seed.weaponUsage || {}) },
        combatState: { ...(base.combatState || {}), ...(seed.combatState || {}) },
        ui: { ...(base.ui || {}), ...(seed.ui || {}) },
      };
      if (!Array.isArray(merged.game) || merged.game.length === 0) {
        merged.game = base.game;
      }
      const applied = Array.isArray(seed.appliedEventIds) ? seed.appliedEventIds : [];
      merged.appliedEventIds = new Set(applied);
      return merged;
    },
    [buildInitialState],
  );

  const [state, dispatch] = useReducer(gameReducer, null, () => {
    const initialState = buildInitialState();
    if (isE2EUrl()) {
      return buildSeedState();
    }
    if (typeof window === "undefined" || typeof window.ktGetGameState !== "function") {
      return initialState;
    }
    const shared = window.ktGetGameState();
    if (!shared || typeof shared !== "object" || !shared.phase) {
      return initialState;
    }
    const merged = {
      ...initialState,
      ...shared,
      topBar: { ...(initialState.topBar || {}), ...(shared.topBar || {}) },
    };
    if (!Array.isArray(merged.game) || merged.game.length === 0) {
      merged.game = initialUnits;
    }
    if (!merged.appliedEventIds) {
      merged.appliedEventIds = new Set();
    }
    return merged;
  });
  const socketRef = useRef(null);
  const seenDamageIdsRef = useRef(new Set());
  const [attackerId, setAttackerId] = useState(null);
  const [defenderId, setDefenderId] = useState(null);
  const [shootModalOpen, setShootModalOpen] = useState(false);
  const [selectedTargetId, setSelectedTargetId] = useState(null);
  const [selectedSecondaryIds, setSelectedSecondaryIds] = useState([]);
  const [intentGate, setIntentGate] = useState({
    open: false,
    issues: [],
    pending: null,
  });
  const [fightDraggedDie, setFightDraggedDie] = useState(null);
  const [fightSelectedDie, setFightSelectedDie] = useState(null);
  const [isFightRolling, setIsFightRolling] = useState(false);
  const [fightRollPreview, setFightRollPreview] = useState({ attacker: [], defender: [] });
  const fightRollIntervalRef = useRef(null);
  const fightRollTimeoutRef = useRef(null);
  const fightRollingRef = useRef(false);
  const [skipToast, setSkipToast] = useState(null);
  const skipToastRef = useRef(null);
  const [tpEndToast, setTpEndToast] = useState(null);
  const prevPhaseRef = useRef(null);
  const stateRef = useRef(state);

  useEffect(() => {
    if (!isE2E()) return undefined;
    if (typeof window === "undefined") return undefined;

    const resetToSeed = () => {
      dispatch({ type: "E2E_SET_STATE", payload: { state: buildSeedState() } });
    };

    const setGameState = (nextState) => {
      const next = nextState && typeof nextState === "object" ? nextState : {};
      dispatch({ type: "E2E_SET_STATE", payload: { state: buildSeedState(next) } });
    };

    const resetToStrategySeed = ({ slot: seedSlot, turningPoint: seedTp } = {}) => {
      const tp = Number(seedTp) || 1;
      const strategySeed = {
        phase: "STRATEGY",
        turningPoint: tp,
        initiativePlayerId: null,
        initiative: {
          winnerPlayerId: null,
        },
        topBar: {
          initiativePlayerId: null,
          turningPoint: tp,
          phase: "STRATEGY",
        },
        cp: { A: 2, B: 2 },
        strategy: {
          activeChooserPlayerId: null,
          passedByPlayer: { A: false, B: false },
          usedPloyIdsByPlayer: { A: [], B: [] },
          lastAction: null,
          cpAwardedForTP: null,
          decisions: [],
          cpGrantedThisTP: false,
          operativesReadiedThisTP: false,
        },
        firefight: {
          activeOperativeId: null,
          activePlayerId: null,
          orderChosenThisActivation: false,
          awaitingOrder: false,
          awaitingActions: false,
        },
        ui: {
          actionFlow: null,
        },
      };
      dispatch({
        type: "E2E_SET_STATE",
        payload: { state: buildSeedState(strategySeed) },
      });
    };

    window.ktResetToSeed = resetToSeed;
    window.ktSetGameState = setGameState;
    window.ktE2E_resetToStrategySeed = resetToStrategySeed;

    return () => {
      if (window.ktResetToSeed === resetToSeed) {
        delete window.ktResetToSeed;
      }
      if (window.ktSetGameState === setGameState) {
        delete window.ktSetGameState;
      }
      if (window.ktE2E_resetToStrategySeed === resetToStrategySeed) {
        delete window.ktE2E_resetToStrategySeed;
      }
    };
  }, [buildSeedState]);

  const [selectedUnitId, setSelectedUnitId] = useState(
    initialUnits?.[0]?.id ?? null,
  );

  const attacker = state.game.find((u) => u.id === attackerId);
  const defender = state.game.find((u) => u.id === defenderId);
  const teamAUnits = state.game.filter((unit) => unit.teamId === "alpha");
  const teamBUnits = state.game.filter((unit) => unit.teamId === "beta");
  const myTeamId = playerSlot === "B" ? "beta" : "alpha";
  const myTeamUnits = myTeamId === "alpha" ? teamAUnits : teamBUnits;
  const myTeamKey =
    playerSlot === "B"
      ? teamKeys?.beta || teamKeys?.alpha
      : teamKeys?.alpha || teamKeys?.beta;
  const selectedUnit =
    myTeamUnits.find((u) => u.id === selectedUnitId) ?? myTeamUnits[0] ?? null;
  const attackerTeamId = selectedUnit?.teamId || myTeamId;
  const opponentUnits = attackerTeamId === "alpha" ? teamBUnits : teamAUnits;
  const orderedMyTeamUnits = [...myTeamUnits]
    .map((unit, index) => ({ unit, index }))
    .sort((a, b) => {
      const aDead = Number(a.unit.state?.woundsCurrent ?? 0) <= 0;
      const bDead = Number(b.unit.state?.woundsCurrent ?? 0) <= 0;
      if (aDead !== bDead) return aDead ? 1 : -1;
      const aReadyState = a.unit.state?.readyState ?? "READY";
      const bReadyState = b.unit.state?.readyState ?? "READY";
      const aExpended = aReadyState === "EXPENDED";
      const bExpended = bReadyState === "EXPENDED";
      if (aExpended !== bExpended) return aExpended ? 1 : -1;
      const aReady = aReadyState === "READY";
      const bReady = bReadyState === "READY";
      if (aReady !== bReady) return aReady ? -1 : 1;
      return a.index - b.index;
    })
    .map(({ unit }) => unit);

  const cp =
    playerSlot === "B"
      ? state.cp?.B ?? 0
      : state.cp?.A ?? 0;
  const vp = 0;
  const turningPoint = state.turningPoint ?? 0;
  const phase = state.phase ?? "SETUP";
  const logEntries = state.log?.entries || [];
  const latestLogEntry =
    logEntries[state.log?.cursor - 1] || logEntries[logEntries.length - 1];
  const latestLogSummary =
    latestLogEntry?.summary || latestLogEntry?.type || "No log entries yet";

  const loopPlayerId = playerSlot || "A";
  const isFirefight = phase === "FIREFIGHT";
  const activeOperativeId = state.firefight?.activeOperativeId ?? null;
  const allOperativesReady = state.game.every((unit) => {
    const isDead = Number(unit.state?.woundsCurrent ?? 0) <= 0;
    if (isDead) return true;
    return unit.state?.readyState === "READY";
  });
  const isFirefightReady =
    phase === "FIREFIGHT" &&
    Boolean(state.firefight?.activePlayerId);
  const canSelectOperative =
    !isFirefight || state.firefight?.activePlayerId === loopPlayerId;
  const isMyTurn = state.firefight?.activePlayerId === loopPlayerId;
  const readyOperatives = getReadyOperatives(state, loopPlayerId);
  const hasReadyOperatives = readyOperatives.length > 0;
  const counteractOperatives = getCounteractCandidates(state, loopPlayerId);
  const canCounteractNow = canCounteract(state, loopPlayerId);
  const hasActiveOperative = Boolean(state.firefight?.activeOperativeId);
  const selectedIsReady =
    selectedUnit?.owner === loopPlayerId &&
    selectedUnit?.state?.readyState === "READY";
  const isCounteractActive =
    isFirefight &&
    state.firefight?.activation?.isCounteract === true &&
    state.firefight?.activeOperativeId === selectedUnit?.id;
  const counteractActionsTaken =
    state.firefight?.activation?.actionsTaken?.length ?? 0;
  const counteractAllowedActions = isCounteractActive
    ? Object.entries(ACTION_CONFIG)
        .filter(([, config]) => Number(config?.cost ?? 0) <= 1)
        .map(([key]) => key)
    : null;
  const awaitingOrder =
    isFirefight &&
    state.firefight?.activeOperativeId === selectedUnit?.id &&
    !state.firefight?.orderChosenThisActivation;
  const awaitingActions =
    isFirefight &&
    state.firefight?.activeOperativeId === selectedUnit?.id &&
    state.firefight?.awaitingActions === true;
  const canUseActions = isFirefight && awaitingActions;
  const canChooseOrder =
    isFirefight &&
    isMyTurn &&
    state.firefight?.activeOperativeId === selectedUnit?.id &&
    !state.firefight?.orderChosenThisActivation;
  const showTurnGlow =
    (phase === "FIREFIGHT" && isMyTurn) ||
    (phase === "STRATEGY" && state.strategy?.turn === loopPlayerId);
  const showActivate =
    isFirefight &&
    isMyTurn &&
    hasReadyOperatives &&
    !hasActiveOperative &&
    selectedIsReady;
  const showActionButtons =
    isFirefight &&
    state.firefight?.activeOperativeId === selectedUnit?.id;
  const inCounteractWindow = isInCounteractWindow(state, loopPlayerId);
  const showCounteract = inCounteractWindow;
  const counteractEligibleIds = counteractOperatives.map((unit) => unit.id);
  const statusMessage =
    awaitingOrder
      ? "Choose order"
      : isCounteractActive
        ? "Counteract: take 1 free action"
      : inCounteractWindow
        ? "No READY operatives. Counteract available."
        : isFirefight &&
            isMyTurn &&
            !hasReadyOperatives &&
            !canCounteractNow
          ? "No ready operatives"
        : null;

  const selectedWeaponName =
    selectedUnit?.state?.selectedWeapon || selectedUnit?.weapons?.[0]?.name;
  const selectedWeapon =
    selectedUnit?.weapons?.find((w) => w.name === selectedWeaponName) ||
    selectedUnit?.weapons?.[0];

  const handleOpenUnitCard = (unit) => {
    if (!username) return;
    const search = isE2E() ? location.search : "";
    navigate(`/${username}/army/unit/${unit.id}${search}`, {
      state: {
        unit,
        slot: playerSlot,
        gameCode,
        topBar: {
          cp,
          vp,
          turningPoint,
          phase,
          initiativePlayerId: state.topBar?.initiativePlayerId ?? null,
        },
        latestLogSummary,
      },
    });
  };

  useEffect(() => {
    if (!username) return;
    if (phase !== "TURNING_POINT_END") return;
    if (location.pathname.endsWith("/turning-point-end")) return;
    const baseState = { ...(location.state || {}) };
    delete baseState.topBar;
    delete baseState.latestLogSummary;
    navigate(`/${username}/turning-point-end`, {
      state: {
        ...baseState,
        slot: playerSlot,
        gameCode,
      },
    });
  }, [
    phase,
    username,
    location.pathname,
    location.state,
    navigate,
    playerSlot,
    gameCode,
  ]);

  useEffect(() => {
    if (!username) return;
    if (phase !== "STRATEGY") return;
    if (location.pathname.endsWith("/strategy-phase")) return;
    const baseState = { ...(location.state || {}) };
    delete baseState.topBar;
    delete baseState.latestLogSummary;
    navigate(`/${username}/strategy-phase`, {
      state: {
        ...baseState,
        slot: playerSlot,
        gameCode,
      },
    });
  }, [
    phase,
    username,
    location.pathname,
    location.state,
    navigate,
    playerSlot,
    gameCode,
    cp,
    vp,
    turningPoint,
    state.topBar?.initiativePlayerId,
    latestLogSummary,
  ]);
  const getAttackCritThreshold = (weapon) => {
    const rules = normalizeWeaponRules(weapon);
    const lethalRule = rules.find((rule) => rule.id === "lethal");
    const value = Number(lethalRule?.value);
    return Number.isFinite(value) ? value : 6;
  };

  const attackCritThreshold = getAttackCritThreshold(selectedWeapon);
  const hasCeaseless = (() => {
    const rules = normalizeWeaponRules(selectedWeapon);
    return rules.some((rule) => rule.id === "ceaseless");
  })();
  const hasBalanced = (() => {
    const rules = normalizeWeaponRules(selectedWeapon);
    return rules.some((rule) => rule.id === "balanced");
  })();
  const hasBlast = (() => {
    const rules = normalizeWeaponRules(selectedWeapon);
    return rules.some((rule) => rule.id === "blast");
  })();
  const getAccurateMax = (weapon) => {
    const rules = normalizeWeaponRules(weapon);
    const rule = rules.find((item) => item.id === "accurate");
    const value = Number(rule?.value);
    return Number.isFinite(value) && value > 0 ? value : 0;
  };
  const canShoot = selectedWeapon?.mode === "ranged";

  useEffect(() => {
    if (!selectedUnit && myTeamUnits.length > 0) {
      setSelectedUnitId(myTeamUnits[0].id);
    }
  }, [selectedUnit, myTeamUnits]);

  useEffect(() => {
    if (!isFirefight) return;
    if (myTeamUnits.length === 0) return;
    const current = myTeamUnits.find((u) => u.id === selectedUnitId);
    if (!current) {
      setSelectedUnitId(myTeamUnits[0].id);
    }
  }, [isFirefight, myTeamUnits, selectedUnitId, state.firefight?.activePlayerId]);

  const lastTpStartRef = useRef(null);
  const lastReadyAllRef = useRef(null);

  useEffect(() => {
    if (phase !== "STRATEGY") return;
    if (!Number.isFinite(Number(turningPoint)) || turningPoint <= 0) return;
    if (lastTpStartRef.current === turningPoint) return;
    dispatchGameEvent("TURNING_POINT_START", { turningPoint });
    lastTpStartRef.current = turningPoint;
  }, [phase, turningPoint]);

  useEffect(() => {
    if (phase !== "STRATEGY") return;
    if (location.pathname.endsWith("/strategy-phase")) return;
    if (!state.topBar?.initiativePlayerId) return;
    if (state.strategy?.cpAwardedForTP === Number(turningPoint)) return;
    const tpNumber = Number(turningPoint) || 1;
    const initiative = state.topBar?.initiativePlayerId;
    const awards = tpNumber === 1
      ? { A: 2, B: 2 }
      : initiative === "A"
        ? { A: 1, B: 2 }
        : { A: 2, B: 1 };
    dispatchGameEvent("AWARD_COMMAND_POINTS", {
      tp: tpNumber,
      awards,
      reason: "STRATEGY_PHASE",
    });
  }, [phase, location.pathname, state.topBar?.initiativePlayerId, state.strategy?.cpAwardedForTP, turningPoint]);

  useEffect(() => {
    if (phase !== "STRATEGY") return;
    if (!state.strategy?.cpGrantedThisTP) return;
    if (state.strategy?.operativesReadiedThisTP) return;
    if (lastReadyAllRef.current === turningPoint) return;
    dispatchGameEvent("READY_ALL_OPERATIVES");
    lastReadyAllRef.current = turningPoint;
  }, [phase, state.strategy?.cpGrantedThisTP, state.strategy?.operativesReadiedThisTP]);

  useEffect(() => {
    const readyA = getReadyOperatives(state, "A").length;
    const readyB = getReadyOperatives(state, "B").length;
    const counteractA = getCounteractCandidates(state, "A").length;
    const counteractB = getCounteractCandidates(state, "B").length;
    console.log("[KT DEBUG] phase", {
      phase,
      turningPoint,
      activePlayerId: state.firefight?.activePlayerId ?? null,
      readyA,
      readyB,
      counteractA,
      counteractB,
    });
  }, [phase, turningPoint, state.firefight?.activePlayerId, state.game]);

  useEffect(() => {
    if (state.phase !== "SETUP") return;
    if (!gameCode) return;
    const readyA = localStorage.getItem(`kt_game_${gameCode}_ready_A`) === "true";
    const readyB = localStorage.getItem(`kt_game_${gameCode}_ready_B`) === "true";
    if (!readyA || !readyB) return;
    if (!state.setup?.teamsLocked) {
      dispatchGameEvent("LOCK_TEAMS");
    }
    if (!state.setup?.deploymentComplete) {
      dispatchGameEvent("DEPLOY_OPERATIVES");
    }
    if (state.setup?.teamsLocked && state.setup?.deploymentComplete) {
      dispatchGameEvent("BEGIN_BATTLE");
    }
  }, [state.phase, state.setup?.teamsLocked, state.setup?.deploymentComplete, gameCode]);


  useEffect(() => {
    if (!isFirefight) return;
    if (!isMyTurn) return;
    if (hasActiveOperative) return;
    if (hasReadyOperatives) return;
    if (canCounteractNow) return;
    const key = `${turningPoint}-${state.firefight?.activePlayerId}`;
    if (skipToastRef.current === key) return;
    skipToastRef.current = key;
    dispatchGameEvent("SKIP_ACTIVATION", { playerId: loopPlayerId });
    setSkipToast(`Player ${loopPlayerId} has no activations`);
    const timer = setTimeout(() => setSkipToast(null), 2000);
    return () => clearTimeout(timer);
  }, [
    isFirefight,
    isMyTurn,
    hasActiveOperative,
    hasReadyOperatives,
    canCounteractNow,
    turningPoint,
    state.firefight?.activePlayerId,
    loopPlayerId,
  ]);

  useEffect(() => {
    const prevPhase = prevPhaseRef.current;
    if (prevPhase === "FIREFIGHT" && phase === "STRATEGY") {
      const endedTp = Math.max(1, Number(turningPoint ?? 1) - 1);
      setTpEndToast(`Turning Point ${endedTp} ended`);
      const timer = setTimeout(() => setTpEndToast(null), 2000);
      prevPhaseRef.current = phase;
      return () => clearTimeout(timer);
    }
    prevPhaseRef.current = phase;
    return undefined;
  }, [phase, turningPoint]);

  const currentPlayerId = playerSlot || getOrCreatePlayerId();
  const otherPlayerId = playerSlot ? (playerSlot === "A" ? "B" : "A") : null;
  const playerDisplayNames = useMemo(() => {
    if (typeof window === "undefined" || !gameCode) return {};
    const readName = (slot) =>
      localStorage.getItem(`kt_game_${gameCode}_player_${slot}_name`) || null;
    return {
      A: readName("A"),
      B: readName("B"),
    };
  }, [gameCode]);
  const combatState = state.combatState;
  const actionFlow = state.ui?.actionFlow ?? null;
  const isTargetSelectStep =
    actionFlow?.mode &&
    (actionFlow.mode === "shoot" || actionFlow.mode === "fight") &&
    actionFlow.step === "pickTarget";
  const isTargetSelectRoute = location.pathname.endsWith("/target-select");
  const prevCombatStageRef = useRef(null);

  const resolvePostCombatPath = () => {
    if (isMyTurn && activeOperativeId) {
      return `/${username}/army/unit/${activeOperativeId}`;
    }
    return `/${username}/army`;
  };

  useEffect(() => {
    if (!username) return;
    if (isTargetSelectStep && !isTargetSelectRoute) {
      navigate(`/${username}/target-select`, {
        state: {
          slot: playerSlot,
          gameCode,
          mode: actionFlow?.mode,
          attackerId: actionFlow?.attackerId ?? null,
        },
      });
      return;
    }
    if (!isTargetSelectStep && isTargetSelectRoute) {
      if (isE2E()) return;
      navigate(`/${username}/army`, {
        state: {
          slot: playerSlot,
          gameCode,
        },
      });
    }
  }, [
    isTargetSelectStep,
    isTargetSelectRoute,
    actionFlow?.mode,
    actionFlow?.attackerId,
    username,
    navigate,
    playerSlot,
    gameCode,
    location.pathname,
    activeOperativeId,
    isMyTurn,
  ]);

  useEffect(() => {
    prevCombatStageRef.current = combatState?.stage ?? null;
  }, [combatState?.stage]);
  const attackResolutionRole =
    combatState?.attackerId === currentPlayerId
      ? "attacker"
      : combatState?.defenderId === currentPlayerId
        ? "defender"
        : null;
  const attackResolutionOpen =
    Boolean(attackResolutionRole) &&
    [
      COMBAT_STAGES.ATTACK_RESOLUTION,
      COMBAT_STAGES.ATTACK_ROLLING,
      COMBAT_STAGES.ATTACK_LOCKED,
      COMBAT_STAGES.DEFENSE_ROLLING,
      COMBAT_STAGES.DEFENSE_LOCKED,
      COMBAT_STAGES.READY_TO_RESOLVE_DAMAGE,
      COMBAT_STAGES.DONE,
    ].includes(combatState?.stage);

  const lastCombatIdsRef = useRef({
    attackingOperativeId: null,
    defendingOperativeId: null,
  });
  const lastFightResolvedRef = useRef(null);

  useEffect(() => {
    if (combatState?.attackingOperativeId || combatState?.defendingOperativeId) {
      lastCombatIdsRef.current = {
        attackingOperativeId: combatState?.attackingOperativeId ?? null,
        defendingOperativeId: combatState?.defendingOperativeId ?? null,
      };
    }
  }, [combatState?.attackingOperativeId, combatState?.defendingOperativeId]);

  useEffect(() => {
    if (!username) return;
    if (combatState?.stage !== COMBAT_STAGES.DONE) return;
    const { attackingOperativeId, defendingOperativeId } = lastCombatIdsRef.current;
    const targetId =
      combatState?.attackerId === currentPlayerId
        ? attackingOperativeId
        : combatState?.defenderId === currentPlayerId
          ? defendingOperativeId
          : null;
    if (!targetId) return;
    const search = isE2E() ? location.search : "";
    const targetPath = `/${username}/army/unit/${targetId}${search}`;
    if (location.pathname === targetPath) return;
    navigate(targetPath, {
      state: {
        slot: playerSlot,
        gameCode,
      },
    });
  }, [
    combatState?.stage,
    combatState?.attackerId,
    combatState?.defenderId,
    currentPlayerId,
    username,
    location.pathname,
    location.search,
    navigate,
    playerSlot,
    gameCode,
  ]);

  useEffect(() => {
    if (!username) return;
    const fightResolved = state.ui?.lastFightResolved;
    const resolvedAt = Number(fightResolved?.resolvedAt);
    if (!Number.isFinite(resolvedAt)) return;
    if (lastFightResolvedRef.current === resolvedAt) return;
    const storageKey = gameCode
      ? `kt_game_${gameCode}_lastFightResolvedHandled`
      : "kt_local_lastFightResolvedHandled";
    const storage = typeof window !== "undefined" ? window.sessionStorage : null;
    const storedValue = Number(storage?.getItem(storageKey));
    if (Number.isFinite(storedValue) && storedValue >= resolvedAt) return;
    lastFightResolvedRef.current = resolvedAt;

    const attackerId = fightResolved?.attackerId ?? null;
    const defenderId = fightResolved?.defenderId ?? null;
    if (!attackerId || !defenderId) return;

    const attackerUnit = state.game.find((unit) => unit.id === attackerId);
    const defenderUnit = state.game.find((unit) => unit.id === defenderId);

    const targetId =
      attackerUnit?.owner === currentPlayerId
        ? attackerId
        : defenderUnit?.owner === currentPlayerId
          ? defenderId
          : null;
    if (!targetId) return;

    const search = isE2E() ? location.search : "";
    const targetPath = `/${username}/army/unit/${targetId}${search}`;
    if (location.pathname === targetPath) return;
    navigate(targetPath, {
      state: {
        slot: playerSlot,
        gameCode,
      },
    });
    if (storage) {
      storage.setItem(storageKey, String(resolvedAt));
    }
  }, [
    state.ui?.lastFightResolved,
    state.game,
    currentPlayerId,
    username,
    location.pathname,
    location.search,
    navigate,
    playerSlot,
    gameCode,
  ]);

  const attackingOperative = state.game.find(
    (unit) => unit.id === combatState?.attackingOperativeId,
  );
  const defendingOperative = state.game.find(
    (unit) => unit.id === combatState?.defendingOperativeId,
  );

  const combatSummary = (() => {
    if (!combatState?.blocks) return null;
    const weapon = combatState?.weaponProfile;
    const remainingHits = combatState.blocks?.remainingHits ?? 0;
    const remainingCrits = combatState.blocks?.remainingCrits ?? 0;
    const [normalDmg, critDmg] = weapon?.dmg?.split("/").map(Number) ?? [0, 0];
    const safeNormal = Number.isFinite(normalDmg) ? normalDmg : 0;
    const safeCrit = Number.isFinite(critDmg) ? critDmg : 0;
    const totalDamage = remainingHits * safeNormal + remainingCrits * safeCrit;
    return {
      hits: remainingHits,
      crits: remainingCrits,
      damage: totalDamage,
      weaponName: weapon?.name,
    };
  })();

  const fightAttacker =
    actionFlow?.mode === "fight"
      ? state.game.find((unit) => unit.id === actionFlow.attackerId)
      : null;
  const fightTargets = fightAttacker
    ? state.game.filter((unit) => unit.teamId !== fightAttacker.teamId)
    : [];
  const fightDefender =
    actionFlow?.mode === "fight"
      ? state.game.find((unit) => unit.id === actionFlow.defenderId)
      : null;
  const fightAttackerWeapons = Array.isArray(fightAttacker?.weapons)
    ? fightAttacker.weapons.filter((weapon) => weapon.mode === "melee")
    : [];
  const fightDefenderWeapons = Array.isArray(fightDefender?.weapons)
    ? fightDefender.weapons.filter((weapon) => weapon.mode === "melee")
    : [];
  const canSelectAttackerWeapon =
    Boolean(fightAttacker?.owner) && fightAttacker.owner === playerSlot;
  const canSelectDefenderWeapon =
    Boolean(fightDefender?.owner) && fightDefender.owner === playerSlot;
  const shootAttacker =
    actionFlow?.mode === "shoot"
      ? state.game.find((unit) => unit.id === actionFlow.attackerId)
      : null;
  const shootDefender =
    actionFlow?.mode === "shoot"
      ? state.game.find((unit) => unit.id === actionFlow.defenderId)
      : null;
  const shootAttackerWeapons = Array.isArray(shootAttacker?.weapons)
    ? shootAttacker.weapons.filter((weapon) => weapon.mode === "ranged")
    : [];
  const shootDefenderWeapons = Array.isArray(shootDefender?.weapons)
    ? shootDefender.weapons.filter((weapon) => weapon.mode === "ranged")
    : [];
  const canSelectShootAttackerWeapon =
    Boolean(shootAttacker?.owner) && shootAttacker.owner === playerSlot;
  const canSelectShootDefenderWeapon =
    Boolean(shootDefender?.owner) && shootDefender.owner === playerSlot;
  const fightAttackerWeapon = fightAttackerWeapons.find(
    (weapon) => weapon.name === actionFlow?.attackerWeapon,
  );
  const fightDefenderWeapon = fightDefenderWeapons.find(
    (weapon) => weapon.name === actionFlow?.defenderWeapon,
  );
  const attackerReady = Boolean(actionFlow?.locked?.attackerWeapon);
  const defenderReady = Boolean(actionFlow?.locked?.defenderWeapon);
  const bothFightReady = attackerReady && defenderReady;
  const fightReadyRole = canSelectAttackerWeapon
    ? "attacker"
    : canSelectDefenderWeapon
      ? "defender"
      : null;
  const isFightWaiting =
    fightReadyRole === "attacker"
      ? attackerReady && !bothFightReady
      : defenderReady && !bothFightReady;
  const canClickFightReady =
    fightReadyRole === "attacker"
      ? Boolean(actionFlow?.attackerWeapon) && !attackerReady
      : Boolean(actionFlow?.defenderWeapon) && !defenderReady;
  const fightOpponentReady =
    fightReadyRole === "attacker" ? defenderReady : attackerReady;
  const shootAttackerReady = Boolean(actionFlow?.locked?.attackerWeapon);
  const shootDefenderReady = Boolean(actionFlow?.locked?.defenderWeapon);
  const bothShootReady = shootAttackerReady && shootDefenderReady;
  const shootReadyRole = canSelectShootAttackerWeapon
    ? "attacker"
    : canSelectShootDefenderWeapon
      ? "defender"
      : null;
  const isShootWaiting =
    shootReadyRole === "attacker"
      ? shootAttackerReady && !bothShootReady
      : shootDefenderReady && !bothShootReady;
  const canClickShootReady =
    shootReadyRole === "attacker"
      ? Boolean(actionFlow?.attackerWeapon) && !shootAttackerReady
      : Boolean(actionFlow?.defenderWeapon) && !shootDefenderReady;
  const shootOpponentReady =
    shootReadyRole === "attacker" ? shootDefenderReady : shootAttackerReady;
  const attackerDiceReady = Boolean(actionFlow?.locked?.attackerDice);
  const defenderDiceReady = Boolean(actionFlow?.locked?.defenderDice);
  const bothDiceReady = attackerDiceReady && defenderDiceReady;
  const fightDiceRole = fightReadyRole;
  const isFightDiceWaiting =
    fightDiceRole === "attacker"
      ? attackerDiceReady && !bothDiceReady
      : defenderDiceReady && !bothDiceReady;
  const canClickFightDice =
    fightDiceRole === "attacker"
      ? !attackerDiceReady && !actionFlow?.locked?.diceRolled
      : !defenderDiceReady && !actionFlow?.locked?.diceRolled;
  const fightResolveRole =
    fightAttacker?.owner === playerSlot
      ? "attacker"
      : fightDefender?.owner === playerSlot
        ? "defender"
        : null;
  const isFightResolveTurn = actionFlow?.resolve?.turn === fightResolveRole;
  const canDragAttackerDice = isFightResolveTurn && fightResolveRole === "attacker";
  const canDragDefenderDice = isFightResolveTurn && fightResolveRole === "defender";
  const canSelectFightDie =
    isFightResolveTurn &&
    (fightResolveRole === "attacker" || fightResolveRole === "defender");
  const fightAttackerDiceEntries = buildFightDiceEntries(
    actionFlow?.dice?.attacker?.raw || [],
    Number(fightAttackerWeapon?.hit ?? 6),
    actionFlow?.remaining?.attacker,
  );
  const fightDefenderDiceEntries = buildFightDiceEntries(
    actionFlow?.dice?.defender?.raw || [],
    Number(fightDefenderWeapon?.hit ?? 6),
    actionFlow?.remaining?.defender,
  );
  const canUseDraggedDie =
    Boolean(fightDraggedDie) &&
    fightDraggedDie.role === actionFlow?.resolve?.turn &&
    fightResolveRole === fightDraggedDie.role;
  const canBlockDie = (actorDieType, targetDieType) => {
    if (actorDieType === "crit") return true;
    return actorDieType === "norm" && targetDieType === "norm";
  };
  const canBlockDraggedDie = (targetDieType) => {
    if (!canUseDraggedDie) return false;
    return canBlockDie(fightDraggedDie?.dieType, targetDieType);
  };
  const canBlockSelectedDie = (targetDieType) => {
    if (!fightSelectedDie) return false;
    if (fightSelectedDie.role !== fightResolveRole) return false;
    if (!isFightResolveTurn) return false;
    return canBlockDie(fightSelectedDie.dieType, targetDieType);
  };

  const renderFightCard = (unit, label) => {
    if (!unit) return null;
    const woundsMax = Number(unit.stats?.woundsMax ?? 0);
    const woundsCurrent = Number(unit.state?.woundsCurrent ?? 0);
    const pct =
      woundsMax === 0 ? 0 : Math.max(0, Math.min(100, (woundsCurrent / woundsMax) * 100));
    const injured = woundsCurrent < woundsMax / 2;
    const equippedName =
      label === "Attacker"
        ? actionFlow?.attackerWeapon || unit.state?.selectedWeapon
        : actionFlow?.defenderWeapon || unit.state?.selectedWeapon;
    const equippedWeapon = (unit.weapons || []).find(
      (weapon) => weapon.name === equippedName,
    );
    const weaponLine = equippedWeapon ? (
      <table className="kt-table fight-weapon__table">
        <thead>
          <tr>
            <th className="left">NAME</th>
            <th>ATK</th>
            <th>HIT</th>
            <th>DMG</th>
            <th className="left">WR</th>
          </tr>
        </thead>
        <tbody>
          <tr className="kt-row kt-row--selected">
            <td className="left">{equippedWeapon.name}</td>
            <td>{equippedWeapon.atk}</td>
            <td>{equippedWeapon.hit}+</td>
            <td>{equippedWeapon.dmg}</td>
            <td className="left">
              {normalizeWeaponRulesList(equippedWeapon.wr).length > 0
                ? normalizeWeaponRulesList(equippedWeapon.wr)
                    .map((rule) => {
                      if (!rule) return "";
                      if (typeof rule === "string") return rule;
                      const id = rule.id || "";
                      const value =
                        rule.value !== undefined && rule.value !== null
                          ? ` ${rule.value}`
                          : "";
                      const note = rule.note ? ` (${rule.note})` : "";
                      return `${id}${value}${note}`.trim();
                    })
                    .filter(Boolean)
                    .join(", ")
                : "-"}
            </td>
          </tr>
        </tbody>
      </table>
    ) : (
      "No weapon selected"
    );
    return (
      <div className="kt-modal__tile">
        <div className="kt-modal__tile-name">
          {label}: {unit.name}
        </div>
        <div className="kt-modal__tile-sub">{weaponLine}</div>
        <div className="kt-modal__tile-sub">
          W {woundsCurrent}/{woundsMax}
        </div>
        <div className="kt-modal__bar">
          <div
            className={`kt-modal__bar-fill ${injured ? "kt-modal__bar-fill--injured" : ""}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  };
  const fightLogEntries = Array.isArray(actionFlow?.log) ? actionFlow.log : [];
  const canCancelFightFlow =
    actionFlow?.mode === "fight" &&
    ["pickTarget", "pickWeapons", "rollDice"].includes(actionFlow?.step) &&
    !actionFlow?.locked?.attackerWeapon &&
    !actionFlow?.locked?.defenderWeapon &&
    !actionFlow?.locked?.attackerDice &&
    !actionFlow?.locked?.defenderDice &&
    !actionFlow?.locked?.diceRolled;
  const canCancelShootFlow =
    actionFlow?.mode === "shoot" &&
    ["pickTarget", "pickWeapons", "rollDice"].includes(actionFlow?.step) &&
    !actionFlow?.locked?.attackerWeapon &&
    !actionFlow?.locked?.defenderWeapon &&
    !actionFlow?.locked?.attackerDice &&
    !actionFlow?.locked?.defenderDice &&
    !actionFlow?.locked?.diceRolled;
  const showWeaponSelect =
    (actionFlow?.mode === "fight" || actionFlow?.mode === "shoot") &&
    actionFlow?.step === "pickWeapons";
  const weaponSelectAttacker = actionFlow?.mode === "shoot" ? shootAttacker : fightAttacker;
  const weaponSelectDefender = actionFlow?.mode === "shoot" ? shootDefender : fightDefender;
  const weaponSelectLocalRole =
    weaponSelectAttacker?.owner === playerSlot
      ? "attacker"
      : weaponSelectDefender?.owner === playerSlot
        ? "defender"
        : null;
  const canCancelWeaponSelect =
    actionFlow?.mode === "shoot" ? canCancelShootFlow : canCancelFightFlow;
  const weaponSelectMovementActions = Array.isArray(
    state.firefight?.activation?.actionsTaken,
  )
    ? state.firefight.activation.actionsTaken
        .map((action) => String(action || "").toLowerCase())
        .filter((action) =>
          ["reposition", "dash", "charge", "fallback"].includes(action),
        )
    : [];

  const showIssues = (result, event) =>
    setIntentGate({
      open: true,
      issues: result.issues,
      pending: event,
    });

  const dispatchIntent = (event, options = {}) => {
    const meta = event?.meta || {};
    const eventId = meta.eventId || generateClientId();
    const ts = Number.isFinite(Number(meta.ts)) ? Number(meta.ts) : Date.now();
    const eventWithMeta = {
      ...event,
      meta: { ...meta, eventId, ts },
    };
    if (isE2E() && !options.forceValidate) {
      dispatch(eventWithMeta);
      return;
    }
    const result = validateGameIntent(state, eventWithMeta);
    if (result.ok || options.override) {
      dispatch(eventWithMeta);
      return;
    }
    showIssues(result, eventWithMeta);
  };

  useEffect(() => {
    if (combatState?.stage !== COMBAT_STAGES.ATTACK_LOCKED) return;
    const timer = setTimeout(() => {
      dispatchCombatEvent("SET_COMBAT_STAGE", {
        stage: COMBAT_STAGES.DEFENSE_ROLLING,
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [combatState?.stage]);

  useEffect(() => {
    if (actionFlow?.mode !== "fight" || actionFlow?.step !== "pickWeapons") return;
    if (canSelectAttackerWeapon && fightAttackerWeapons.length === 1) {
      const onlyWeapon = fightAttackerWeapons[0]?.name;
      if (onlyWeapon && actionFlow?.attackerWeapon !== onlyWeapon) {
        dispatchGameEvent("FLOW_SET_WEAPON", {
          role: "attacker",
          weaponName: onlyWeapon,
        });
      }
    }
    if (canSelectDefenderWeapon && fightDefenderWeapons.length === 1) {
      const onlyWeapon = fightDefenderWeapons[0]?.name;
      if (onlyWeapon && actionFlow?.defenderWeapon !== onlyWeapon) {
        dispatchGameEvent("FLOW_SET_WEAPON", {
          role: "defender",
          weaponName: onlyWeapon,
        });
      }
    }
  }, [
    actionFlow?.mode,
    actionFlow?.step,
    actionFlow?.attackerWeapon,
    actionFlow?.defenderWeapon,
    canSelectAttackerWeapon,
    canSelectDefenderWeapon,
    fightAttackerWeapons,
    fightDefenderWeapons,
  ]);

  useEffect(() => {
    if (actionFlow?.mode !== "shoot" || actionFlow?.step !== "pickWeapons") return;
    if (canSelectShootAttackerWeapon && shootAttackerWeapons.length === 1) {
      const onlyWeapon = shootAttackerWeapons[0]?.name;
      if (onlyWeapon && actionFlow?.attackerWeapon !== onlyWeapon) {
        dispatchGameEvent("FLOW_SET_WEAPON", {
          role: "attacker",
          weaponName: onlyWeapon,
        });
      }
    }
    if (canSelectShootDefenderWeapon && shootDefenderWeapons.length === 1) {
      const onlyWeapon = shootDefenderWeapons[0]?.name;
      if (onlyWeapon && actionFlow?.defenderWeapon !== onlyWeapon) {
        dispatchGameEvent("FLOW_SET_WEAPON", {
          role: "defender",
          weaponName: onlyWeapon,
        });
      }
    }
  }, [
    actionFlow?.mode,
    actionFlow?.step,
    actionFlow?.attackerWeapon,
    actionFlow?.defenderWeapon,
    canSelectShootAttackerWeapon,
    canSelectShootDefenderWeapon,
    shootAttackerWeapons,
    shootDefenderWeapons,
  ]);

  useEffect(() => {
    if (actionFlow?.mode !== "fight" || actionFlow?.step !== "resolve") {
      setFightDraggedDie(null);
      setFightSelectedDie(null);
    }
  }, [actionFlow?.mode, actionFlow?.step]);

  useEffect(() => {
    const shouldAnimate =
      actionFlow?.mode === "fight" &&
      actionFlow?.step === "rollDice" &&
      bothDiceReady &&
      !actionFlow?.locked?.diceRolled;

    if (!shouldAnimate) {
      setIsFightRolling(false);
      setFightRollPreview({ attacker: [], defender: [] });
      fightRollingRef.current = false;
      if (fightRollIntervalRef.current) clearInterval(fightRollIntervalRef.current);
      if (fightRollTimeoutRef.current) clearTimeout(fightRollTimeoutRef.current);
      fightRollIntervalRef.current = null;
      fightRollTimeoutRef.current = null;
      return;
    }

    if (fightRollingRef.current) return;
    fightRollingRef.current = true;
    setIsFightRolling(true);
    const attackerAtk = Number(fightAttackerWeapon?.atk ?? 0);
    const defenderAtk = Number(fightDefenderWeapon?.atk ?? 0);
    fightRollIntervalRef.current = setInterval(() => {
      setFightRollPreview({
        attacker: Array.from({ length: Math.max(0, attackerAtk) }, () => 1 + Math.floor(Math.random() * 6)),
        defender: Array.from({ length: Math.max(0, defenderAtk) }, () => 1 + Math.floor(Math.random() * 6)),
      });
    }, 100);

    fightRollTimeoutRef.current = setTimeout(() => {
      if (fightRollIntervalRef.current) clearInterval(fightRollIntervalRef.current);
      fightRollIntervalRef.current = null;
      fightRollingRef.current = false;
      setIsFightRolling(false);
      if (fightAttacker?.owner !== playerSlot) return;

      const attackerHit = Number(fightAttackerWeapon?.hit ?? 6);
      const defenderHit = Number(fightDefenderWeapon?.hit ?? 6);
      const roll = (count) =>
        Array.from({ length: Math.max(0, count) }, () =>
          1 + Math.floor(Math.random() * 6),
        );
      const countResults = (raw, hit) => {
        const crit = raw.filter((v) => v === 6).length;
        const norm = raw.filter((v) => v >= hit && v !== 6).length;
        return { raw, crit, norm };
      };

      const attackerRaw = roll(attackerAtk);
      const defenderRaw = roll(defenderAtk);
      const attackerResults = countResults(attackerRaw, attackerHit);
      const defenderResults = countResults(defenderRaw, defenderHit);
      const attackerSuccesses = attackerRaw.filter(
        (value) => value === 6 || (value >= attackerHit && value !== 6),
      );
      const defenderSuccesses = defenderRaw.filter(
        (value) => value === 6 || (value >= defenderHit && value !== 6),
      );

      dispatchGameEvent("FLOW_ROLL_DICE", {
        attacker: attackerResults,
        defender: defenderResults,
        attackerSuccesses,
        defenderSuccesses,
      });
    }, 2000);

    return () => {
      if (fightRollIntervalRef.current) clearInterval(fightRollIntervalRef.current);
      if (fightRollTimeoutRef.current) clearTimeout(fightRollTimeoutRef.current);
      fightRollIntervalRef.current = null;
      fightRollTimeoutRef.current = null;
      fightRollingRef.current = false;
    };
  }, [
    actionFlow?.mode,
    actionFlow?.step,
    actionFlow?.locked?.diceRolled,
    bothDiceReady,
    fightAttackerWeapon?.atk,
    fightDefenderWeapon?.atk,
    fightAttackerWeapon?.hit,
    fightDefenderWeapon?.hit,
    fightAttacker?.owner,
    playerSlot,
  ]);

  useEffect(() => {
    if (actionFlow?.mode !== "shoot") return;
    if (!actionFlow?.locked?.attackerWeapon || !actionFlow?.locked?.defenderWeapon) {
      return;
    }
    if (combatState?.attackingOperativeId) return;
    if (!shootAttacker || !shootDefender) return;
    if (!isE2E() && shootAttacker?.owner !== playerSlot) return;

    const preferredWeaponName =
      actionFlow?.attackerWeapon ||
      shootAttacker?.state?.selectedWeapon ||
      shootAttackerWeapons[0]?.name ||
      "";
    const selectedWeapon =
      shootAttackerWeapons.find((weapon) => weapon.name === preferredWeaponName) ||
      shootAttackerWeapons[0];
    if (!selectedWeapon) return;

    const blastInputs = {
      primaryTargetId:
        actionFlow?.inputs?.primaryTargetId ?? actionFlow?.defenderId ?? null,
      secondaryTargetIds: Array.isArray(actionFlow?.inputs?.secondaryTargetIds)
        ? actionFlow.inputs.secondaryTargetIds
        : [],
    };

    const ctx = {
      weapon: selectedWeapon,
      weaponProfile: selectedWeapon,
      weaponRules: normalizeWeaponRules(selectedWeapon),
      inputs: blastInputs,
      modifiers: {},
      ui: { prompts: [], notes: [], appliedRules: {} },
      effects: { attacker: [], defender: [] },
      log: [],
    };
    runWeaponRuleHook(ctx, "ON_DECLARE_ATTACK");
    const attackQueue = Array.isArray(ctx.attackQueue) ? ctx.attackQueue : [];
    const firstTargetId = attackQueue[0]?.targetId ?? blastInputs.primaryTargetId;

    const attackerOwner = shootAttacker?.owner ?? playerSlot ?? null;
    const defenderOwner = shootDefender?.owner ??
      (playerSlot ? (playerSlot === "A" ? "B" : "A") : null);

    const startPayload = {
      attackerId: attackerOwner,
      defenderId: defenderOwner,
      attackingOperativeId: shootAttacker?.id || null,
      defendingOperativeId: firstTargetId,
      weaponId: selectedWeapon?.name || null,
      weaponProfile: selectedWeapon || null,
      attackQueue,
      inputs: blastInputs,
    };

    if (isE2E()) {
      dispatch({
        type: "START_RANGED_ATTACK",
        payload: startPayload,
        meta: { eventId: generateClientId(), ts: Date.now() },
      });
    } else {
      dispatchCombatEvent("START_RANGED_ATTACK", startPayload);
    }
  }, [
    actionFlow?.mode,
    actionFlow?.locked?.attackerWeapon,
    actionFlow?.locked?.defenderWeapon,
    actionFlow?.attackerWeapon,
    actionFlow?.inputs,
    actionFlow?.defenderId,
    combatState?.attackingOperativeId,
    shootAttacker,
    shootDefender,
    shootAttackerWeapons,
    playerSlot,
  ]);

  useEffect(() => {
    if (!isE2E()) return;
    if (actionFlow?.mode !== "shoot") return;
    if (!actionFlow?.locked?.attackerWeapon || !actionFlow?.locked?.defenderWeapon) return;
    if (combatState?.attackingOperativeId) return;

    const attackerId = actionFlow?.attackerId ?? null;
    const defenderId = actionFlow?.defenderId ?? null;
    const attackerUnit = state.game.find((unit) => unit.id === attackerId) || null;
    const defenderUnit = state.game.find((unit) => unit.id === defenderId) || null;
    const attackerWeapons = Array.isArray(attackerUnit?.weapons)
      ? attackerUnit.weapons
      : [];
    const preferredWeaponName =
      actionFlow?.attackerWeapon ||
      attackerUnit?.state?.selectedWeapon ||
      attackerWeapons[0]?.name ||
      null;
    const weaponProfile =
      attackerWeapons.find((weapon) => weapon.name === preferredWeaponName) ||
      attackerWeapons[0] ||
      null;
    const primaryTargetId =
      actionFlow?.inputs?.primaryTargetId ?? defenderId ?? null;
    const secondaryTargetIds = Array.isArray(actionFlow?.inputs?.secondaryTargetIds)
      ? actionFlow.inputs.secondaryTargetIds
      : [];
    const attackQueue = primaryTargetId
      ? [
          {
            targetId: primaryTargetId,
            isBlastSecondary: false,
            inheritFromPrimary: false,
          },
        ]
      : [];

    dispatch({
      type: "START_RANGED_ATTACK",
      payload: {
        attackerId: attackerUnit?.owner ?? null,
        defenderId: defenderUnit?.owner ?? null,
        attackingOperativeId: attackerId,
        defendingOperativeId: primaryTargetId,
        weaponId: preferredWeaponName,
        weaponProfile,
        attackQueue,
        inputs: {
          primaryTargetId,
          secondaryTargetIds,
        },
      },
      meta: { eventId: generateClientId(), ts: Date.now() },
    });
  }, [
    actionFlow?.mode,
    actionFlow?.locked?.attackerWeapon,
    actionFlow?.locked?.defenderWeapon,
    actionFlow?.attackerWeapon,
    actionFlow?.attackerId,
    actionFlow?.defenderId,
    actionFlow?.inputs,
    combatState?.attackingOperativeId,
    state.game,
  ]);

  // fight roll handled in animated roll effect

  useEffect(() => {
    if (combatState?.stage !== COMBAT_STAGES.DEFENSE_LOCKED) return;
    const timer = setTimeout(() => {
      dispatchCombatEvent("SET_COMBAT_STAGE", {
        stage: COMBAT_STAGES.BLOCKS_RESOLVING,
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [combatState?.stage]);

  useEffect(() => {
    if (
      combatState?.stage !== COMBAT_STAGES.ATTACK_ROLLING &&
      combatState?.stage !== COMBAT_STAGES.ATTACK_RESOLUTION
    )
      return;
    const queue = combatState?.attackQueue || [];
    const currentIndex = combatState?.currentAttackIndex ?? 0;
    if (!queue[currentIndex]) return;

    const ctx = {
      weapon: combatState?.weaponProfile,
      weaponProfile: combatState?.weaponProfile,
      weaponRules: normalizeWeaponRules(combatState?.weaponProfile),
      currentAttackItem: queue[currentIndex],
      targetId: queue[currentIndex]?.targetId,
      modifiers: { ...(combatState?.modifiers || {}) },
      inputs: { ...(combatState?.inputs || {}) },
      ui: { prompts: [], notes: [], appliedRules: {} },
      effects: { attacker: [], defender: [] },
      log: [],
    };

    runWeaponRuleHook(ctx, "ON_BEGIN_ATTACK_SEQUENCE");

    if (!queue[currentIndex]?.isBlastSecondary) {
      runWeaponRuleHook(ctx, "ON_SNAPSHOT_PRIMARY_TARGET_STATE");
    }

    dispatchCombatEvent("SET_COMBAT_MODIFIERS", { modifiers: ctx.modifiers });
  }, [combatState?.stage, combatState?.currentAttackIndex]);

  const closeIntentGate = () =>
    setIntentGate({ open: false, issues: [], pending: null });

  const sendMultiplayerEvent = (kind, payload = {}, eventId = null, ts = null) => {
    if (!gameCode || !playerSlot) return;
    const eventTs = Number.isFinite(Number(ts)) ? Number(ts) : Date.now();
    const event = {
      id:
        eventId ||
        (typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`),
      ts: eventTs,
      slot: playerSlot,
      kind,
      payload,
    };

    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          type: "EVENT",
          code: gameCode,
          slot: playerSlot,
          event,
        }),
      );
    }

    return event;
  };

  const dispatchCombatEvent = (type, payload = {}) => {
    const nextPayload = payload?.playerId
      ? payload
      : { ...payload, playerId: currentPlayerId };
    if (typeof window !== "undefined" && Array.isArray(window.__ktE2E_combatEvents)) {
      window.__ktE2E_combatEvents.push({ type, payload: nextPayload });
    }
    const eventId = generateClientId();
    const ts = Date.now();
    dispatchIntent({ type, payload: nextPayload, meta: { eventId, ts } });
    sendMultiplayerEvent(
      "COMBAT_EVENT",
      { type, payload: nextPayload, eventId, ts },
      eventId,
      ts,
    );
  };

  const dispatchGameEvent = (type, payload = {}) => {
    if (typeof window !== "undefined" && Array.isArray(window.__ktE2E_gameEvents)) {
      window.__ktE2E_gameEvents.push({ type, payload });
    }
    const eventId = generateClientId();
    const ts = Date.now();
    dispatchIntent({ type, payload, meta: { eventId, ts } });
    sendMultiplayerEvent("GAME_EVENT", { type, payload, eventId, ts }, eventId, ts);
  };

  const publishGameState = (nextState) => {
    if (typeof window === "undefined") return;
    stateRef.current = nextState;
    const subs = window.__ktGameStateSubs;
    if (subs && subs.size) {
      subs.forEach((fn) => {
        try {
          fn(nextState);
        } catch {
          // ignore subscriber errors
        }
      });
    }
    window.dispatchEvent(
      new CustomEvent("kt:state", { detail: { state: nextState } }),
    );
  };

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const urlE2E = new URLSearchParams(window.location.search).get("e2e") === "1";
    const e2e =
      urlE2E ||
      Array.isArray(window.__ktE2E_gameEvents) ||
      Array.isArray(window.__ktE2E_combatEvents);
    if (e2e) {
      if (!Array.isArray(window.__ktE2E_gameEvents)) {
        window.__ktE2E_gameEvents = [];
      }
      if (!Array.isArray(window.__ktE2E_combatEvents)) {
        window.__ktE2E_combatEvents = [];
      }
    }
    window.ktDispatchGameEvent = (type, payload = {}) => {
      dispatchGameEvent(type, payload);
    };
    return () => {
      delete window.ktDispatchGameEvent;
    };
  }, [dispatchGameEvent]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const urlE2E = new URLSearchParams(window.location.search).get("e2e") === "1";
    const e2e =
      urlE2E ||
      Array.isArray(window.__ktE2E_gameEvents) ||
      Array.isArray(window.__ktE2E_combatEvents);
    if (e2e && !Array.isArray(window.__ktE2E_combatEvents)) {
      window.__ktE2E_combatEvents = [];
    }
    window.ktDispatchCombatEvent = (type, payload = {}) => {
      dispatchCombatEvent(type, payload);
    };
    if (e2e) {
      window.ktE2E_forceCombatStart = ({
        attackerSlot,
        defenderSlot,
        attackingOperativeId,
        defendingOperativeId,
        weaponName,
        stage,
      } = {}) => {
        const state = window.ktGetGameState?.();
        if (!state || typeof window.ktSetGameState !== "function") return;

        const attackerUnit =
          state.game.find((unit) => unit.id === attackingOperativeId) ||
          state.game.find((unit) => unit.teamId === "alpha") ||
          state.game[0] ||
          null;
        const defenderUnit =
          state.game.find((unit) => unit.id === defendingOperativeId) ||
          state.game.find((unit) => unit.teamId === "beta") ||
          state.game.find((unit) => unit.id !== attackerUnit?.id) ||
          null;

        const attackerOwner = attackerSlot ?? attackerUnit?.owner ?? "A";
        const defenderOwner =
          defenderSlot ??
          defenderUnit?.owner ??
          (attackerOwner === "A" ? "B" : "A");

        const attackerWeapons = Array.isArray(attackerUnit?.weapons)
          ? attackerUnit.weapons
          : [];
        const preferredWeaponName =
          weaponName || attackerUnit?.state?.selectedWeapon || attackerWeapons[0]?.name;
        const weaponProfile =
          attackerWeapons.find((weapon) => weapon.name === preferredWeaponName) ||
          attackerWeapons.find((weapon) => weapon.mode === "ranged") ||
          attackerWeapons[0] ||
          null;

        const targetId = defendingOperativeId ?? defenderUnit?.id ?? null;
        const attackQueue = targetId
          ? [
              {
                targetId,
                isBlastSecondary: false,
                inheritFromPrimary: false,
              },
            ]
          : [];

        if (Array.isArray(window.__ktE2E_combatEvents)) {
          window.__ktE2E_combatEvents.push({
            type: "START_RANGED_ATTACK",
            payload: {
              attackerId: attackerOwner,
              defenderId: defenderOwner,
              attackingOperativeId: attackerUnit?.id ?? null,
              defendingOperativeId: targetId,
              weaponId: weaponProfile?.name ?? null,
              weaponProfile,
              attackQueue,
              inputs: {
                primaryTargetId: targetId,
                secondaryTargetIds: [],
              },
            },
          });
        }

        window.ktSetGameState({
          ...state,
          ui: {
            ...(state.ui || {}),
            actionFlow: null,
          },
          firefight: {
            ...(state.firefight || {}),
            activeOperativeId:
              attackerUnit?.id ?? state.firefight?.activeOperativeId ?? null,
          },
          combatState: {
            ...initialCombatState,
            attackerId: attackerOwner,
            defenderId: defenderOwner,
            attackingOperativeId: attackerUnit?.id ?? null,
            defendingOperativeId: targetId,
            weaponId: weaponProfile?.name ?? null,
            weaponProfile,
            stage: stage || COMBAT_STAGES.ATTACK_RESOLUTION,
            attackQueue,
            currentAttackIndex: 0,
            currentAttackItem: attackQueue[0] ?? null,
            inputs: {
              ...(initialCombatState.inputs || {}),
              primaryTargetId: targetId,
              secondaryTargetIds: [],
            },
          },
        });
      };
      window.ktE2E_forceCombatDone = ({
        attackerSlot,
        defenderSlot,
        attackingOperativeId,
        defendingOperativeId,
        activePlayerId,
        activeOperativeId,
      } = {}) => {
        const state = window.ktGetGameState?.();
        if (state && typeof window.ktSetGameState === "function") {
          if (Array.isArray(window.__ktE2E_combatEvents)) {
            window.__ktE2E_combatEvents.push({
              type: "START_RANGED_ATTACK",
              payload: {
                attackerId: attackerSlot ?? state.combatState?.attackerId ?? null,
                defenderId: defenderSlot ?? state.combatState?.defenderId ?? null,
                attackingOperativeId:
                  attackingOperativeId ?? state.combatState?.attackingOperativeId ?? null,
                defendingOperativeId:
                  defendingOperativeId ?? state.combatState?.defendingOperativeId ?? null,
                weaponId: null,
                weaponProfile: null,
              },
            });
            window.__ktE2E_combatEvents.push({
              type: "RESOLVE_COMBAT_DONE",
              payload: {},
            });
          }
          window.ktSetGameState({
            ...state,
            ui: {
              ...(state.ui || {}),
              actionFlow: null,
            },
            firefight: {
              ...(state.firefight || {}),
              activePlayerId: activePlayerId ?? state.firefight?.activePlayerId ?? null,
              activeOperativeId:
                activeOperativeId ?? state.firefight?.activeOperativeId ?? null,
            },
            combatState: {
              ...(state.combatState || {}),
              attackerId: attackerSlot ?? state.combatState?.attackerId ?? null,
              defenderId: defenderSlot ?? state.combatState?.defenderId ?? null,
              attackingOperativeId:
                attackingOperativeId ?? state.combatState?.attackingOperativeId ?? null,
              defendingOperativeId:
                defendingOperativeId ?? state.combatState?.defendingOperativeId ?? null,
              stage: COMBAT_STAGES.DONE,
            },
          });

          const slotFromQuery =
            new URLSearchParams(window.location.search).get("slot") || null;
          const activeSlot = playerSlot || slotFromQuery || null;
          const targetId =
            activeSlot === (attackerSlot ?? state.combatState?.attackerId ?? null)
              ? attackingOperativeId ?? state.combatState?.attackingOperativeId ?? null
              : activeSlot === (defenderSlot ?? state.combatState?.defenderId ?? null)
                ? defendingOperativeId ?? state.combatState?.defendingOperativeId ?? null
                : defendingOperativeId ??
                  state.combatState?.defendingOperativeId ??
                  attackingOperativeId ??
                  state.combatState?.attackingOperativeId ??
                  null;
          if (username && targetId) {
            const search = isE2E() ? window.location.search : "";
            const targetPath = `/${username}/army/unit/${targetId}${search}`;
            if (window.location.pathname !== targetPath) {
              navigate(targetPath, {
                state: {
                  slot: playerSlot,
                  gameCode,
                },
              });
              window.history.pushState({}, "", targetPath);
              setTimeout(() => {
                if (window.location.pathname !== targetPath) {
                  window.location.assign(targetPath);
                }
              }, 50);
            }
          }
          return;
        }
        if (activeOperativeId) {
          dispatchGameEvent("SET_ACTIVE_OPERATIVE", {
            playerId: activePlayerId ?? attackerSlot ?? null,
            operativeId: activeOperativeId,
          });
        }
        dispatchCombatEvent("START_RANGED_ATTACK", {
          attackerId: attackerSlot ?? null,
          defenderId: defenderSlot ?? null,
          attackingOperativeId: attackingOperativeId ?? null,
          defendingOperativeId: defendingOperativeId ?? null,
          weaponId: null,
          weaponProfile: null,
        });
        dispatchCombatEvent("RESOLVE_COMBAT_DONE");
        setTimeout(() => {
          dispatchCombatEvent("CLEAR_COMBAT_STATE");
        }, 100);
      };
      window.ktE2E_endCombatNow = () => {
        const state = window.ktGetGameState?.();
        const attackerId = state?.combatState?.attackerId ?? "A";
        const defenderId = state?.combatState?.defenderId ?? (attackerId === "A" ? "B" : "A");
        const attackingOperativeId =
          state?.combatState?.attackingOperativeId ||
          state?.game?.find((unit) => unit.teamId === "alpha")?.id ||
          null;
        const defendingOperativeId =
          state?.combatState?.defendingOperativeId ||
          state?.game?.find((unit) => unit.teamId === "beta")?.id ||
          null;
        const activePlayerId = state?.firefight?.activePlayerId ?? attackerId;
        const activeOperativeId = state?.firefight?.activeOperativeId ?? attackingOperativeId;
        window.ktE2E_forceCombatDone?.({
          attackerSlot: attackerId,
          defenderSlot: defenderId,
          attackingOperativeId,
          defendingOperativeId,
          activePlayerId,
          activeOperativeId,
        });
      };
    }
    return () => {
      delete window.ktDispatchCombatEvent;
      if (window.ktE2E_forceCombatDone) {
        delete window.ktE2E_forceCombatDone;
      }
      if (window.ktE2E_forceCombatStart) {
        delete window.ktE2E_forceCombatStart;
      }
      if (window.ktE2E_endCombatNow) {
        delete window.ktE2E_endCombatNow;
      }
    };
  }, [dispatchCombatEvent, navigate, username, playerSlot, gameCode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.__ktGameStateSubs) {
      window.__ktGameStateSubs = new Set();
    }
    window.ktGetGameState = () => stateRef.current;
    window.ktSubscribeGameState = (fn) => {
      if (typeof fn !== "function") return () => {};
      window.__ktGameStateSubs.add(fn);
      fn(stateRef.current);
      return () => window.__ktGameStateSubs.delete(fn);
    };
  }, []);

  useEffect(() => {
    publishGameState(state);
  }, [state]);

  const dispatchDamageEvent = (targetUnitId, damage) => {
    if (!targetUnitId || typeof damage !== "number") return;
    const eventId = generateClientId();
    const ts = Date.now();
    dispatchIntent({
      type: "APPLY_DAMAGE",
      payload: { targetUnitId, damage },
      meta: { eventId, ts },
    });
    sendMultiplayerEvent(
      "DAMAGE_APPLIED",
      { targetUnitId, damage },
      eventId,
      ts,
    );
  };

  const applyRemoteDamageEvent = (event) => {
    if (!event || event.kind !== "DAMAGE_APPLIED") return;
    if (!event.id || seenDamageIdsRef.current.has(event.id)) return;
    const { targetUnitId, damage } = event.payload || {};
    if (!targetUnitId || typeof damage !== "number") return;
    seenDamageIdsRef.current.add(event.id);
    dispatch({
      type: "APPLY_DAMAGE",
      payload: { targetUnitId, damage },
      meta: { eventId: event.id, ts: event.ts },
    });
  };

  const applyRemoteCombatEvent = (event) => {
    if (!event || event.kind !== "COMBAT_EVENT") return;
    if (!event.id) return;
    const { type, payload } = event.payload || {};
    if (!type) return;
    dispatch({ type, payload, meta: { eventId: event.id, ts: event.ts } });
  };

  const applyRemoteGameEvent = (event) => {
    if (!event || event.kind !== "GAME_EVENT") return;
    if (!event.id) return;
    const { type, payload } = event.payload || {};
    if (!type) return;
    dispatch({ type, payload, meta: { eventId: event.id, ts: event.ts } });
  };

  useEffect(() => {
    if (isE2E()) return undefined;
    if (!gameCode || !playerSlot) return undefined;

    const socket = connectWS({
      code: gameCode,
      playerId: getOrCreatePlayerId(),
      onMessage: (message) => {
        if (message.type === "SNAPSHOT" && Array.isArray(message.eventLog)) {
          message.eventLog.forEach((event) => {
            applyRemoteDamageEvent(event);
            applyRemoteCombatEvent(event);
            applyRemoteGameEvent(event);
          });
          return;
        }
        if (message.type === "EVENT" && message.event) {
          applyRemoteDamageEvent(message.event);
          applyRemoteCombatEvent(message.event);
          applyRemoteGameEvent(message.event);
        }
      },
    });

    socketRef.current = socket;

    return () => {
      socketRef.current = null;
      socket.close();
    };
  }, [gameCode, playerSlot]);

  if (!renderUi) return null;

  return (
    <div className="App" data-testid="screen-root">
      <div className={`kt-shell ${showTurnGlow ? "kt-shell--turn-glow" : ""}`}>
        <div className="kt-main">
          <TopBar
            cp={cp}
            vp={vp}
            turningPoint={turningPoint}
            phase={phase}
            initiativePlayerId={state.topBar?.initiativePlayerId ?? null}
            gameCode={gameCode}
          />
          <LogNotice summary={latestLogSummary} />

          <main className="kt-detail">
            {tpEndToast && <div className="kt-toast">{tpEndToast}</div>}
            {skipToast && <div className="kt-toast">{skipToast}</div>}
            <div className="kt-card-grid" data-testid="unit-grid">
              {orderedMyTeamUnits.map((unit) => (
                <UnitCard
                  key={unit.id}
                  unit={unit}
                  dispatch={dispatchIntent}
                  canChooseOrder={canChooseOrder}
                  activeOperativeId={state.firefight?.activeOperativeId ?? null}
                  onCardClick={handleOpenUnitCard}
                  className={
                    inCounteractWindow && counteractEligibleIds.includes(unit.id)
                      ? "kt-card--counteract"
                      : ""
                  }
                  onChooseOrder={
                    isFirefight
                      ? (order) => {
                          dispatchGameEvent("SET_ORDER", {
                            operativeId: unit.id,
                            order,
                          });
                        }
                      : null
                  }
                />
              ))}
            </div>
          </main>
        </div>
      </div>

      {showWeaponSelect && (
        <WeaponSelectModal
          open={showWeaponSelect}
          mode={actionFlow?.mode}
          attackerUnit={weaponSelectAttacker}
          defenderUnit={weaponSelectDefender}
          attackerWeapon={actionFlow?.attackerWeapon || null}
          defenderWeapon={actionFlow?.defenderWeapon || null}
          attackerReady={attackerReady}
          defenderReady={defenderReady}
          localRole={weaponSelectLocalRole}
          weaponUsage={state.weaponUsage || {}}
          movementActions={weaponSelectMovementActions}
          onSetWeapon={(role, weaponName) => {
            dispatchGameEvent("FLOW_SET_WEAPON", { role, weaponName });
          }}
          onReady={(role) => {
            dispatchGameEvent("FLOW_LOCK_WEAPON", { role });

            if (actionFlow?.mode !== "shoot") return;
            if (combatState?.attackingOperativeId) return;

            const nextLocked = {
              ...(actionFlow?.locked || {}),
              attackerWeapon:
                role === "attacker"
                  ? true
                  : Boolean(actionFlow?.locked?.attackerWeapon),
              defenderWeapon:
                role === "defender"
                  ? true
                  : Boolean(actionFlow?.locked?.defenderWeapon),
            };

            if (!nextLocked.attackerWeapon || !nextLocked.defenderWeapon) return;
            if (!shootAttacker || !shootDefender) return;

            const preferredWeaponName =
              actionFlow?.attackerWeapon ||
              shootAttacker?.state?.selectedWeapon ||
              shootAttackerWeapons[0]?.name ||
              "";
            const selectedWeapon =
              shootAttackerWeapons.find((weapon) => weapon.name === preferredWeaponName) ||
              shootAttackerWeapons[0];
            if (!selectedWeapon) return;

            const blastInputs = {
              primaryTargetId:
                actionFlow?.inputs?.primaryTargetId ?? actionFlow?.defenderId ?? null,
              secondaryTargetIds: Array.isArray(actionFlow?.inputs?.secondaryTargetIds)
                ? actionFlow.inputs.secondaryTargetIds
                : [],
            };

            const attackerOwner = shootAttacker?.owner ?? playerSlot ?? null;
            const defenderOwner = shootDefender?.owner ??
              (playerSlot ? (playerSlot === "A" ? "B" : "A") : null);

            dispatchCombatEvent("START_RANGED_ATTACK", {
              attackerId: attackerOwner,
              defenderId: defenderOwner,
              attackingOperativeId: shootAttacker?.id || null,
              defendingOperativeId: blastInputs.primaryTargetId,
              weaponId: selectedWeapon?.name || null,
              weaponProfile: selectedWeapon || null,
              attackQueue: blastInputs.primaryTargetId
                ? [
                    {
                      targetId: blastInputs.primaryTargetId,
                      isBlastSecondary: false,
                      inheritFromPrimary: false,
                    },
                  ]
                : [],
              inputs: blastInputs,
            });
          }}
          onCancel={() => {
            if (!canCancelWeaponSelect) return;
            dispatchGameEvent("FLOW_CANCEL");
          }}
        />
      )}

      {actionFlow?.mode === "fight" && actionFlow?.step === "rollDice" && (
        <AttackResolutionScreen
          open
          role={fightDiceRole}
          attacker={fightAttacker}
          defender={fightDefender}
          weapon={
            fightAttackerWeapon ||
            fightAttackerWeapons[0] ||
            fightDefenderWeapon ||
            fightDefenderWeapons[0] ||
            null
          }
          combatStage="FIGHT_ROLLING"
          attackRoll={actionFlow?.dice?.attacker?.raw || []}
          defenseRoll={actionFlow?.dice?.defender?.raw || []}
          combatModifiers={actionFlow?.inputs || {}}
          battleLog={actionFlow?.log || []}
          finalEntry={actionFlow?.finalEntry || null}
          weaponUsage={state.weaponUsage || {}}
          teamKeys={teamKeys}
          playerDisplayNames={playerDisplayNames}
          rollsLocked={
            Boolean(actionFlow?.locked?.attackerDice) &&
            Boolean(actionFlow?.locked?.defenderDice)
          }
          attackLocked={Boolean(actionFlow?.locked?.attackerDice)}
          defenseLocked={Boolean(actionFlow?.locked?.defenderDice)}
          attackDiceCount={Number(fightAttackerWeapon?.atk ?? 0)}
          defenseDiceCount={Number(fightDefenderWeapon?.atk ?? 0)}
          onSetAttackRoll={() => {}}
          onLockAttack={() => {
            if (!fightDiceRole || fightDiceRole !== "attacker") return;
            dispatchGameEvent("FLOW_LOCK_DICE", { role: "attacker" });
          }}
          onSetDefenseRoll={() => {}}
          onLockDefense={() => {
            if (!fightDiceRole || fightDiceRole !== "defender") return;
            dispatchGameEvent("FLOW_LOCK_DICE", { role: "defender" });
          }}
          onSetCombatModifiers={() => {}}
          onApplyDamage={(targetUnitId, damage) => {
            dispatchDamageEvent(targetUnitId, damage);
          }}
          onResolveComplete={() => {
            dispatchGameEvent("FLOW_RESOLVE_COMBAT", { force: true });
          }}
          onCancel={() => {
            if (!canCancelFightFlow) return;
            dispatchGameEvent("FLOW_CANCEL");
          }}
          onAppendBattleLog={(entry) => {
            dispatchCombatEvent("COMBAT_LOG_APPEND", { entry });
          }}
          onSetFinalEntry={(finalEntry) => {
            dispatchGameEvent("FLOW_SET_FINAL_ENTRY", { finalEntry });
          }}
          onSpendCp={(playerId, cost) => {
            dispatchGameEvent("SPEND_CP", { playerId, cost });
          }}
        />
      )}

      {actionFlow?.mode === "fight" &&
        (actionFlow?.step === "resolve" || actionFlow?.step === "summary") && (
        <div
          className={`kt-modal ${
            actionFlow?.step === "resolve" && actionFlow?.resolve?.turn
              ? "kt-modal--turn-glow"
              : ""
          }`}
          data-testid="fight-modal-resolve"
        >
          <div className="kt-modal__backdrop" />
          <div className="kt-modal__panel">
            <div className="kt-modal__layout">
              <aside className="kt-modal__sidebar">
                <div className="kt-modal__sidebar-group">
                  <div className="kt-modal__sidebar-title">Fight: Resolve</div>
                  {actionFlow?.step === "resolve" && (
                    <div className="kt-modal__sidebar-empty">
                      Turn: {actionFlow?.resolve?.turn}
                    </div>
                  )}
                  <div className="kt-modal__sidebar-empty">
                    Drag your die to Strike or drop it onto an opponent die to Block.
                  </div>
                  {fightLogEntries.length > 0 && (
                    <div className="fight-log">
                      {fightLogEntries.map((entry) => (
                        <div
                          key={entry.id}
                          className={`fight-log__item fight-log__item--${entry.role}`}
                        >
                          {entry.message}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </aside>
              <div className="kt-modal__content">
                <div className="kt-modal__header">
                  <div className="kt-modal__title">Fight: Resolve</div>
                  <div className="kt-modal__subtitle">
                    {fightAttacker?.name || "Attacker"} vs {fightDefender?.name || "Defender"}
                  </div>
                </div>
                <div className="kt-modal__grid">
                  {renderFightCard(fightAttacker, "Attacker")}
                  {renderFightCard(fightDefender, "Defender")}
                </div>
                {actionFlow?.step === "summary" ? (
                  <div className="defense-roll__section">
                    <div className="defense-roll__label">Combat resolved</div>
                    <button
                      className="kt-modal__btn kt-modal__btn--primary"
                      type="button"
                      disabled={fightResolveRole !== "attacker"}
                      onClick={() => {
                        if (fightResolveRole !== "attacker") return;
                        dispatchGameEvent("FLOW_RESOLVE_COMBAT");
                      }}
                    >
                      Resolve Combat
                    </button>
                  </div>
                ) : (
                  <div className="allocation">
                  <div className="allocation__block">
                    <div className="allocation__label">Attacker Dice</div>
                    <div className="allocation__grid">
                      {fightAttackerDiceEntries.length > 0 ? (
                        fightAttackerDiceEntries.map((die) => (
                          <button
                            key={die.id}
                            type="button"
                            className={`allocation__die allocation__die--${die.typeClass} ${
                              die.used || die.isMiss ? "allocation__die--disabled" : ""
                            } ${
                              fightSelectedDie?.role === "attacker" &&
                              fightSelectedDie?.dieType === die.dieType
                                ? "allocation__die--selected"
                                : ""
                            } ${
                              fightDraggedDie?.role === "defender" &&
                              canBlockDraggedDie(die.dieType)
                                ? "allocation__die--droppable"
                                : ""
                            }`}
                            draggable={canDragAttackerDice && !die.used && !die.isMiss}
                            onDragStart={() => {
                              if (!canDragAttackerDice || die.used || die.isMiss) return;
                              setFightDraggedDie({
                                role: "attacker",
                                dieType: die.dieType,
                              });
                            }}
                            onDragEnd={() => setFightDraggedDie(null)}
                            onClick={() => {
                              if (fightResolveRole === "attacker" && canSelectFightDie) {
                                if (die.used || die.isMiss) return;
                                setFightSelectedDie({
                                  role: "attacker",
                                  dieType: die.dieType,
                                });
                                return;
                              }
                              if (
                                fightSelectedDie &&
                                fightSelectedDie.role === fightResolveRole &&
                                canBlockSelectedDie(die.dieType)
                              ) {
                                if (die.isMiss || die.used) return;
                                dispatchGameEvent("FLOW_RESOLVE_ACTION", {
                                  actorRole: fightSelectedDie.role,
                                  actionType: "block",
                                  dieType: fightSelectedDie.dieType,
                                  blockedType: die.dieType,
                                });
                                setFightSelectedDie(null);
                              }
                            }}
                            onDragOver={(event) => {
                              if (
                                fightDraggedDie?.role !== "defender" ||
                                !canBlockDraggedDie(die.dieType)
                              ) {
                                return;
                              }
                              event.preventDefault();
                            }}
                            onDrop={() => {
                              if (
                                fightDraggedDie?.role !== "defender" ||
                                !canBlockDraggedDie(die.dieType)
                              ) {
                                return;
                              }
                              dispatchGameEvent("FLOW_RESOLVE_ACTION", {
                                actorRole: fightDraggedDie.role,
                                actionType: "block",
                                dieType: fightDraggedDie.dieType,
                                blockedType: die.dieType,
                              });
                              setFightDraggedDie(null);
                            }}
                          >
                            <div className="allocation__pips">
                              {Array.from({ length: 9 }).map((_, pipIndex) => (
                                <span
                                  key={pipIndex}
                                  className={`allocation__pip ${
                                    pipIndicesForValue(die.value).includes(pipIndex)
                                      ? "allocation__pip--on"
                                      : ""
                                  }`}
                                />
                              ))}
                            </div>
                          </button>
                        ))
                      ) : (
                        <span className="defense-roll__placeholder">—</span>
                      )}
                    </div>
                  </div>

                  <div className="allocation__block">
                    <div className="allocation__label">Strike</div>
                    <div className="allocation__grid">
                      <div
                        className={`allocation__die fight-resolve__strike ${
                          canUseDraggedDie ? "allocation__die--droppable" : ""
                        }`}
                        role="button"
                        tabIndex={0}
                        data-testid="fight-strike"
                        onDragOver={(event) => {
                          if (!canUseDraggedDie) return;
                          event.preventDefault();
                        }}
                        onDrop={() => {
                          if (!canUseDraggedDie) return;
                          dispatchGameEvent("FLOW_RESOLVE_ACTION", {
                            actorRole: fightDraggedDie.role,
                            actionType: "strike",
                            dieType: fightDraggedDie.dieType,
                          });
                          setFightDraggedDie(null);
                        }}
                        onClick={() => {
                          if (!fightSelectedDie || fightSelectedDie.role !== fightResolveRole) return;
                          dispatchGameEvent("FLOW_RESOLVE_ACTION", {
                            actorRole: fightSelectedDie.role,
                            actionType: "strike",
                            dieType: fightSelectedDie.dieType,
                          });
                          setFightSelectedDie(null);
                        }}
                      >
                        Strike
                      </div>
                    </div>
                  </div>


                  <div className="allocation__block">
                    <div className="allocation__label">Defender Dice</div>
                    <div className="allocation__grid">
                      {fightDefenderDiceEntries.length > 0 ? (
                        fightDefenderDiceEntries.map((die) => (
                          <button
                            key={die.id}
                            type="button"
                            className={`allocation__die allocation__die--${die.typeClass} ${
                              die.used || die.isMiss ? "allocation__die--disabled" : ""
                            } ${
                              fightSelectedDie?.role === "defender" &&
                              fightSelectedDie?.dieType === die.dieType
                                ? "allocation__die--selected"
                                : ""
                            } ${
                              fightDraggedDie?.role === "attacker" &&
                              canBlockDraggedDie(die.dieType)
                                ? "allocation__die--droppable"
                                : ""
                            }`}
                            draggable={canDragDefenderDice && !die.used && !die.isMiss}
                            onDragStart={() => {
                              if (!canDragDefenderDice || die.used || die.isMiss) return;
                              setFightDraggedDie({
                                role: "defender",
                                dieType: die.dieType,
                              });
                            }}
                            onDragEnd={() => setFightDraggedDie(null)}
                            onClick={() => {
                              if (fightResolveRole === "defender" && canSelectFightDie) {
                                if (die.used || die.isMiss) return;
                                setFightSelectedDie({
                                  role: "defender",
                                  dieType: die.dieType,
                                });
                                return;
                              }
                              if (
                                fightSelectedDie &&
                                fightSelectedDie.role === fightResolveRole &&
                                canBlockSelectedDie(die.dieType)
                              ) {
                                if (die.isMiss || die.used) return;
                                dispatchGameEvent("FLOW_RESOLVE_ACTION", {
                                  actorRole: fightSelectedDie.role,
                                  actionType: "block",
                                  dieType: fightSelectedDie.dieType,
                                  blockedType: die.dieType,
                                });
                                setFightSelectedDie(null);
                              }
                            }}
                            onDragOver={(event) => {
                              if (
                                fightDraggedDie?.role !== "attacker" ||
                                !canBlockDraggedDie(die.dieType)
                              ) {
                                return;
                              }
                              event.preventDefault();
                            }}
                            onDrop={() => {
                              if (
                                fightDraggedDie?.role !== "attacker" ||
                                !canBlockDraggedDie(die.dieType)
                              ) {
                                return;
                              }
                              dispatchGameEvent("FLOW_RESOLVE_ACTION", {
                                actorRole: fightDraggedDie.role,
                                actionType: "block",
                                dieType: fightDraggedDie.dieType,
                                blockedType: die.dieType,
                              });
                              setFightDraggedDie(null);
                            }}
                          >
                            <div className="allocation__pips">
                              {Array.from({ length: 9 }).map((_, pipIndex) => (
                                <span
                                  key={pipIndex}
                                  className={`allocation__pip ${
                                    pipIndicesForValue(die.value).includes(pipIndex)
                                      ? "allocation__pip--on"
                                      : ""
                                  }`}
                                />
                              ))}
                            </div>
                          </button>
                        ))
                      ) : (
                        <span className="defense-roll__placeholder">—</span>
                      )}
                    </div>
                  </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <AttackResolutionScreen
        open={attackResolutionOpen}
        role={attackResolutionRole}
        attacker={attackingOperative}
        defender={defendingOperative}
        weapon={combatState?.weaponProfile || selectedWeapon}
        combatStage={combatState?.stage}
        attackRoll={combatState?.attackRoll}
        defenseRoll={combatState?.defenseRoll}
        combatModifiers={combatState?.modifiers}
        battleLog={combatState?.log || []}
        finalEntry={combatState?.finalEntry || null}
        weaponUsage={state.weaponUsage || {}}
        teamKeys={teamKeys}
        playerDisplayNames={playerDisplayNames}
        rollsLocked={
          combatState?.rollsLocked ||
          (combatState?.rollReady?.A && combatState?.rollReady?.B)
        }
        attackLocked={combatState?.attackLocked}
        defenseLocked={combatState?.defenseLocked}
        attackDiceCount={combatState?.weaponProfile?.atk ?? selectedWeapon?.atk ?? 0}
        defenseDiceCount={3}
        onSetAttackRoll={(roll) => {
          dispatchCombatEvent("SET_ATTACK_ROLL", { roll });
        }}
        onLockAttack={() => {
          dispatchCombatEvent("COMBAT_SET_ROLL_READY", {
            playerId: combatState?.attackerId,
            ready: true,
          });
        }}
        onSetDefenseRoll={(roll) => {
          dispatchCombatEvent("SET_DEFENSE_ROLL", { roll });
        }}
        onLockDefense={() => {
          dispatchCombatEvent("COMBAT_SET_ROLL_READY", {
            playerId: combatState?.defenderId,
            ready: true,
          });
        }}
        onSetCombatModifiers={(modifiers) => {
          dispatchCombatEvent("SET_COMBAT_MODIFIERS", { modifiers });
        }}
        onApplyDamage={(targetUnitId, damage) => {
          dispatchDamageEvent(targetUnitId, damage);
        }}
        onResolveComplete={() => {
          dispatchCombatEvent("RESOLVE_COMBAT_DONE");

          const queue = combatState?.attackQueue || [];
          const idx = combatState?.currentAttackIndex ?? 0;
          if (queue.length > 0 && idx < queue.length - 1) {
            dispatchCombatEvent("ADVANCE_ATTACK_QUEUE");
          } else {
            setTimeout(() => {
              dispatchCombatEvent("CLEAR_COMBAT_STATE");
            }, 0);
          }
        }}
        onCancel={() => {
          dispatchCombatEvent("CANCEL_COMBAT");
        }}
        onAppendBattleLog={(entry) => {
          dispatchCombatEvent("COMBAT_LOG_APPEND", { entry });
        }}
        onSetFinalEntry={(finalEntry) => {
          dispatchCombatEvent("COMBAT_SET_FINAL_ENTRY", { finalEntry });
        }}
        onSpendCp={(playerId, cost) => {
          dispatchGameEvent("SPEND_CP", { playerId, cost });
        }}
      />

      {intentGate.open && (
        <div className="kt-intentgate">
          <div className="kt-intentgate__panel">
            <h3>Action blocked</h3>
            <ul>
              {intentGate.issues.map((issue, index) => (
                <li key={`${issue.message}-${index}`}>
                  <strong>{issue.message}</strong>
                  {issue.unitId && <span> (unit: {issue.unitId})</span>}
                  {issue.targetUnitId && (
                    <span> (target: {issue.targetUnitId})</span>
                  )}
                </li>
              ))}
            </ul>
            <div className="kt-intentgate__actions">
              <button type="button" className="btn" onClick={closeIntentGate}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => {
                  if (intentGate.pending) {
                    dispatchIntent(intentGate.pending, { override: true });
                  }
                  closeIntentGate();
                }}
              >
                Override
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ArmyOverlayRoute({ renderUi = true }) {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const e2e = params.get("e2e") === "1";
  const slotFromQuery = params.get("slot") === "B" ? "B" : "A";
  const armyKeyFromQuery = params.get("armyKey") || null;
  const armyKeyFromQueryB = params.get("armyKeyB") || null;
  const gameCode = location.state?.gameCode;
  const slot = location.state?.slot;
  const armyKey = location.state?.armyKey;
  const storedArmyKeyA = gameCode
    ? localStorage.getItem(`kt_game_${gameCode}_army_A`)
    : null;
  const storedArmyKeyB = gameCode
    ? localStorage.getItem(`kt_game_${gameCode}_army_B`)
    : null;
  const readStoredJson = (storageKey) => {
    if (!storageKey) return null;
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };
  const storedUnitIdsA = gameCode
    ? readStoredJson(`kt_game_${gameCode}_units_A`)
    : null;
  const storedUnitIdsB = gameCode
    ? readStoredJson(`kt_game_${gameCode}_units_B`)
    : null;
  const storedWeaponsA = gameCode
    ? readStoredJson(`kt_game_${gameCode}_weapons_A`)
    : null;
  const storedWeaponsB = gameCode
    ? readStoredJson(`kt_game_${gameCode}_weapons_B`)
    : null;
  const armyKeyA = e2e
    ? armyKeyFromQuery || "kommandos" || armies[0]?.key
    : location.state?.armyKeyA ||
      (slot === "A" ? armyKey : undefined) ||
      storedArmyKeyA ||
      armyKey;
  const armyKeyB = e2e
    ? armyKeyFromQueryB || armyKeyFromQuery || "kommandos" || armies[1]?.key || armies[0]?.key
    : location.state?.armyKeyB ||
      (slot === "B" ? armyKey : undefined) ||
      storedArmyKeyB ||
      armyKey;
  const selectedUnitIds = location.state?.selectedUnitIds;
  const selectedUnitIdsA = e2e
    ? null
    : location.state?.selectedUnitIdsA ||
      (slot === "A" ? selectedUnitIds : undefined) ||
      storedUnitIdsA;
  const selectedUnitIdsB = e2e
    ? null
    : location.state?.selectedUnitIdsB ||
      (slot === "B" ? selectedUnitIds : undefined) ||
      storedUnitIdsB;

  const selectedWeaponsByUnitId = location.state?.selectedWeaponsByUnitId;
  const selectedWeaponsByUnitIdA = e2e
    ? null
    : location.state?.selectedWeaponsByUnitIdA ||
      (slot === "A" ? selectedWeaponsByUnitId : undefined) ||
      storedWeaponsA;
  const selectedWeaponsByUnitIdB = e2e
    ? null
    : location.state?.selectedWeaponsByUnitIdB ||
      (slot === "B" ? selectedWeaponsByUnitId : undefined) ||
      storedWeaponsB;

  const teamA = armies.find((army) => army.key === armyKeyA) || armies[0];
  const teamB = armies.find((army) => army.key === armyKeyB) || teamA;

  const sliceUnits = (units) => (Array.isArray(units) ? units.slice(0, 3) : []);

  const filteredUnitsA = e2e
    ? sliceUnits(teamA.units)
    : Array.isArray(selectedUnitIdsA)
      ? teamA.units.filter((unit) => selectedUnitIdsA.includes(unit.id))
      : teamA.units;

  const filteredUnitsB = e2e
    ? sliceUnits(teamB.units)
    : Array.isArray(selectedUnitIdsB)
      ? teamB.units.filter((unit) => selectedUnitIdsB.includes(unit.id))
      : teamB.units;

  const buildTeamUnits = (units, teamId, weaponSelections, forceBlastSelected = false) =>
    units.map((unit) => {
      const selectedWeaponNames = Array.isArray(weaponSelections?.[unit.id])
        ? weaponSelections[unit.id]
        : null;
      const findBlastWeapon = (weaponList) =>
        weaponList.find((weapon) =>
          normalizeWeaponRulesList(weapon?.wr).some((rule) => {
            if (!rule) return false;
            if (typeof rule === "string") return rule.toLowerCase().includes("blast");
            return rule.id === "blast";
          }),
        );
      const filteredWeapons = Array.isArray(unit.weapons)
        ? selectedWeaponNames && selectedWeaponNames.length > 0
          ? unit.weapons.filter((weapon) =>
              selectedWeaponNames.includes(weapon.name),
            )
          : unit.weapons
        : [];
      const forcedSelectedWeapon = forceBlastSelected
        ? findBlastWeapon(filteredWeapons)?.name || filteredWeapons[0]?.name
        : null;

      return {
        ...unit,
        id: `${teamId}:${unit.id}`,
        baseId: unit.id,
        teamId,
        owner: teamId === "alpha" ? "A" : "B",
        stats: { ...unit.stats },
        state: {
          ...unit.state,
          ...(forcedSelectedWeapon
            ? { selectedWeapon: forcedSelectedWeapon }
            : {}),
          apCurrent:
            Number.isFinite(Number(unit.state?.apCurrent))
              ? Number(unit.state?.apCurrent)
              : Number(unit.stats?.apl ?? 0),
          actionMarks: { ...(unit.state?.actionMarks ?? {}) },
          readyState: unit.state?.readyState ?? "READY",
          hasCounteractedThisTP:
            unit.state?.hasCounteractedThisTP ?? false,
        },
        weapons:
          filteredWeapons.map((weapon) => ({
            ...weapon,
            wr: normalizeWeaponRulesList(weapon.wr),
          })) ?? [],
        rules: unit.rules?.map((rule) => ({ ...rule })) ?? [],
        abilities: unit.abilities?.map((ability) => ({ ...ability })) ?? [],
      };
    });

  const combinedUnits = [
    ...buildTeamUnits(filteredUnitsA, "alpha", selectedWeaponsByUnitIdA, e2e),
    ...buildTeamUnits(filteredUnitsB, "beta", selectedWeaponsByUnitIdB, false),
  ];

  if (e2e && !location.state?.slot) {
    return (
      <GameOverlay
        initialUnits={combinedUnits}
        playerSlot={slotFromQuery}
        gameCode="E2E"
        teamKeys={{ alpha: teamA?.key, beta: teamB?.key }}
        renderUi={renderUi}
      />
    );
  }

  return (
    <GameOverlay
      key={`${teamA?.key || "team-a"}-${teamB?.key || "team-b"}`}
      initialUnits={combinedUnits}
      playerSlot={e2e ? slotFromQuery : slot}
      gameCode={e2e ? "E2E" : gameCode}
      teamKeys={{ alpha: teamA?.key, beta: teamB?.key }}
      renderUi={renderUi}
    />
  );
}

function StrategyPhaseRoute() {
  return (
    <>
      <ArmyOverlayRoute renderUi={false} />
      <StrategyPhase />
    </>
  );
}

function TurningPointEndRoute() {
  return (
    <>
      <ArmyOverlayRoute renderUi={false} />
      <TurningPointEnd />
    </>
  );
}

function UnitActionRoute() {
  return (
    <>
      <ArmyOverlayRoute renderUi={false} />
      <UnitCardFocused />
    </>
  );
}

function TargetSelectRoute() {
  return (
    <>
      <ArmyOverlayRoute renderUi={false} />
      <TargetSelectScreen />
    </>
  );
}

function E2EAttackResolutionRoute() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const targetOrderParam = String(params.get("targetOrder") || "engage").toLowerCase();
  const roleParam = String(params.get("role") || "attacker").toLowerCase();
  const modeParam = String(params.get("mode") || "shoot").toLowerCase();
  const role = roleParam === "defender" ? "defender" : "attacker";
  const defenderOrder = targetOrderParam === "conceal" ? "conceal" : "engage";
  const isFight = modeParam === "fight";
  const [rollsLocked, setRollsLocked] = useState(false);
  const [open, setOpen] = useState(true);
  const resolveChannelRef = useRef(null);
  const [attackRoll, setAttackRoll] = useState([]);
  const [defenseRoll, setDefenseRoll] = useState([]);
  const [combatModifiers, setCombatModifiers] = useState({});
  const modifiersChannelRef = useRef(null);

  useEffect(() => {
    const channel = new BroadcastChannel("kt-e2e-combat-modifiers");
    modifiersChannelRef.current = channel;
    channel.onmessage = (event) => {
      if (event?.data?.source === role) return;
      if (event?.data?.type !== "SET_COMBAT_MODIFIERS") return;
      setCombatModifiers(event.data.modifiers || {});
    };
    return () => {
      channel.close();
      if (modifiersChannelRef.current === channel) {
        modifiersChannelRef.current = null;
      }
    };
  }, [role]);

  useEffect(() => {
    const channel = new BroadcastChannel("kt-e2e-attack-resolution");
    resolveChannelRef.current = channel;
    channel.onmessage = (event) => {
      if (event?.data?.type !== "RESOLVE_COMPLETE") return;
      setOpen(false);
    };
    return () => {
      channel.close();
      if (resolveChannelRef.current === channel) {
        resolveChannelRef.current = null;
      }
    };
  }, []);

  const attacker = useMemo(
    () => ({
      id: "e2e-attacker",
      name: "E2E Attacker",
      owner: "A",
      stats: { move: 6, save: 4, apl: 3, woundsMax: 12 },
      state: {
        woundsCurrent: 12,
        order: defenderOrder,
        apCurrent: 3,
        selectedWeapon: "E2E Blaster",
        readyState: "READY",
      },
      weapons: [
        {
          name: "E2E Blaster",
          mode: isFight ? "melee" : "ranged",
          hit: 4,
          atk: 4,
          dmg: isFight ? "4/5" : "3/4",
          wr: [],
        },
      ],
      rules: [],
      abilities: [],
    }),
    [defenderOrder, isFight],
  );

  const defender = useMemo(
    () => ({
      id: "e2e-defender",
      name: "E2E Defender",
      owner: "B",
      stats: { move: 6, save: 4, apl: 3, woundsMax: 12 },
      state: {
        woundsCurrent: 12,
        order: defenderOrder,
        apCurrent: 3,
        selectedWeapon: "E2E Blaster",
        readyState: "READY",
      },
      weapons: [
        {
          name: "E2E Blaster",
          mode: isFight ? "melee" : "ranged",
          hit: 4,
          atk: 4,
          dmg: isFight ? "4/5" : "3/4",
          wr: [],
        },
      ],
      rules: [],
      abilities: [],
    }),
    [defenderOrder, isFight],
  );

  const weapon = attacker.weapons[0];

  return (
    <div style={{ padding: 16 }}>
      <button
        type="button"
        className="btn btn--ghost"
        data-testid="e2e-lock-rolls"
        onClick={() => setRollsLocked((prev) => !prev)}
      >
        {rollsLocked ? "Unlock Rolls" : "Lock Rolls"}
      </button>
      <AttackResolutionScreen
        open={open}
        role={role}
        attacker={attacker}
        defender={defender}
        weapon={weapon}
        combatStage={isFight ? "FIGHT_ROLLING" : "ATTACK_ROLLING"}
        attackRoll={attackRoll}
        defenseRoll={defenseRoll}
        combatModifiers={combatModifiers}
        weaponUsage={{}}
        teamKeys={{ alpha: "kommandos", beta: "kommandos" }}
        rollsLocked={rollsLocked}
        attackLocked={rollsLocked}
        defenseLocked={rollsLocked}
        attackDiceCount={4}
        defenseDiceCount={isFight ? 4 : 3}
        onSetAttackRoll={(roll) => setAttackRoll(Array.isArray(roll) ? roll : [])}
        onLockAttack={() => setRollsLocked(true)}
        onSetDefenseRoll={(roll) => setDefenseRoll(Array.isArray(roll) ? roll : [])}
        onLockDefense={() => setRollsLocked(true)}
        onSetCombatModifiers={(modifiers) => {
          setCombatModifiers(modifiers || {});
          modifiersChannelRef.current?.postMessage({
            type: "SET_COMBAT_MODIFIERS",
            modifiers: modifiers || {},
            source: role,
          });
        }}
        onApplyDamage={() => {}}
        onResolveComplete={() => {
          setOpen(false);
          resolveChannelRef.current?.postMessage({ type: "RESOLVE_COMPLETE" });
        }}
        onCancel={() => {
          setOpen(false);
          resolveChannelRef.current?.postMessage({ type: "RESOLVE_COMPLETE" });
        }}
        onSpendCp={() => {}}
      />
    </div>
  );
}

function App() {
  useEffect(() => {
    const existingId = localStorage.getItem("kt_playerId");
    if (!existingId) {
      localStorage.setItem("kt_playerId", generateClientId());
    }
    if (!localStorage.getItem("kt_playerName")) {
      localStorage.setItem("kt_playerName", "");
    }
  }, []);

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/multiplayer" replace />} />
      <Route path="/multiplayer" element={<MultiplayerLobby />} />
      <Route path="/:username/army-selector" element={<ArmySelector />} />
      <Route path="/:username/unit-selector" element={<UnitSelector />} />
      <Route path="/:username/strategy-phase" element={<StrategyPhaseRoute />} />
      <Route path="/:username/turning-point-end" element={<TurningPointEndRoute />} />
      <Route path="/:username/army" element={<ArmyOverlayRoute />} />
      <Route path="/:username/army/unit/:unitId" element={<UnitActionRoute />} />
      <Route path="/:username/target-select" element={<TargetSelectRoute />} />
      <Route path="/e2e/attack-resolution" element={<E2EAttackResolutionRoute />} />
      <Route path="*" element={<Navigate to="/multiplayer" replace />} />
    </Routes>
  );
}

export default App;
