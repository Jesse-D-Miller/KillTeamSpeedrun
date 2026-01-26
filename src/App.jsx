import "./App.css";
import UnitCard from "./ui/components/UnitCard";
import TopBar from "./ui/components/TopBar";
import LogNotice from "./ui/components/LogNotice";
import InitiativeModal from "./ui/components/InitiativeModal";
import TargetSelectModal from "./ui/components/TargetSelectModal";
import DiceInputModal from "./ui/components/DiceInputModal";
import DefenseAllocationModal from "./ui/components/DefenseAllocationModal";
import DefenseRollModal from "./ui/components/DefenseRollModal";
import ArmySelector from "./ui/screens/ArmySelector";
import UnitSelector from "./ui/screens/UnitSelector";
import MultiplayerLobby from "./ui/screens/MultiplayerLobby";
import UnitCardFocused from "./ui/screens/UnitCardFocused";
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
import { useEffect, useReducer, useRef, useState } from "react";
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

const armies = Object.entries(killteamModules).map(([path, data]) => ({
  key: getArmyKey(path),
  name: getArmyKey(path).replace(/[-_]+/g, " "),
  units: normalizeKillteamData(data),
}));

function GameOverlay({ initialUnits, playerSlot, gameCode, teamKeys }) {
  const navigate = useNavigate();
  const { username } = useParams();
  const [state, dispatch] = useReducer(gameReducer, {
    gameId: generateClientId(),
    appliedEventIds: new Set(),
    phase: "SETUP",
    turningPoint: 0,
    initiativePlayerId: null,
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
    combatState: initialCombatState,
    ui: {
      actionFlow: null,
    },
  });
  const socketRef = useRef(null);
  const seenDamageIdsRef = useRef(new Set());
  const [attackerId, setAttackerId] = useState(null);
  const [defenderId, setDefenderId] = useState(null);
  const [shootModalOpen, setShootModalOpen] = useState(false);
  const [selectedTargetId, setSelectedTargetId] = useState(null);
  const [selectedSecondaryIds, setSelectedSecondaryIds] = useState([]);
  const [allocationModalOpen, setAllocationModalOpen] = useState(false);
  const [pendingAttack, setPendingAttack] = useState(null);
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
    navigate(`/${username}/army/unit/${unit.id}`, {
      state: {
        unit,
        slot: playerSlot,
        gameCode,
        topBar: {
          cp,
          vp,
          turningPoint,
          phase,
          initiativePlayerId: state.initiativePlayerId,
        },
        latestLogSummary,
      },
    });
  };
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
    if (!state.initiativePlayerId) return;
    if (state.strategy?.cpGrantedThisTP) return;
    dispatchGameEvent("GAIN_CP");
  }, [phase, state.initiativePlayerId, state.strategy?.cpGrantedThisTP]);

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
  const showInitiativeModal =
    phase === "STRATEGY" && !state.initiativePlayerId;
  const isStrategyReady =
    phase === "STRATEGY" &&
    Number.isFinite(Number(turningPoint)) &&
    turningPoint >= 1 &&
    turningPoint <= 4 &&
    Boolean(state.setup?.teamsLocked) &&
    Boolean(state.setup?.deploymentComplete);
  const combatState = state.combatState;
  const actionFlow = state.ui?.actionFlow ?? null;
  const attackModalOpen =
    [
      COMBAT_STAGES.ATTACK_ROLLING,
      COMBAT_STAGES.ATTACK_LOCKED,
      COMBAT_STAGES.DEFENSE_ROLLING,
      COMBAT_STAGES.BLOCKS_RESOLVING,
      COMBAT_STAGES.READY_TO_RESOLVE_DAMAGE,
      COMBAT_STAGES.DONE,
    ].includes(combatState?.stage) &&
    combatState?.attackerId === currentPlayerId;
  const defenseModalOpen =
    [
      COMBAT_STAGES.ATTACK_ROLLING,
      COMBAT_STAGES.ATTACK_LOCKED,
      COMBAT_STAGES.DEFENSE_ROLLING,
      COMBAT_STAGES.READY_TO_RESOLVE_DAMAGE,
      COMBAT_STAGES.DONE,
    ].includes(combatState?.stage) &&
    combatState?.defenderId === currentPlayerId;
  const blocksModalOpen =
    combatState?.stage === COMBAT_STAGES.BLOCKS_RESOLVING &&
    combatState?.defenderId === currentPlayerId;

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
    if (combatState?.stage !== COMBAT_STAGES.ATTACK_ROLLING) return;
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
    const eventId = generateClientId();
    const ts = Date.now();
    dispatchIntent({ type, payload, meta: { eventId, ts } });
    sendMultiplayerEvent("COMBAT_EVENT", { type, payload, eventId, ts }, eventId, ts);
  };

  const dispatchGameEvent = (type, payload = {}) => {
    const eventId = generateClientId();
    const ts = Date.now();
    dispatchIntent({ type, payload, meta: { eventId, ts } });
    sendMultiplayerEvent("GAME_EVENT", { type, payload, eventId, ts }, eventId, ts);
  };

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

  return (
    <div className="App">
      <div className={`kt-shell ${showTurnGlow ? "kt-shell--turn-glow" : ""}`}>
        <div className="kt-main">
          <TopBar
            cp={cp}
            vp={vp}
            turningPoint={turningPoint}
            phase={phase}
            initiativePlayerId={state.initiativePlayerId}
          />
          <LogNotice summary={latestLogSummary} />

          <main className="kt-detail">
            {tpEndToast && <div className="kt-toast">{tpEndToast}</div>}
            {skipToast && <div className="kt-toast">{skipToast}</div>}
            <div className="kt-card-grid">
              {myTeamUnits.map((unit) => (
                <UnitCard
                  key={unit.id}
                  unit={unit}
                  dispatch={dispatchIntent}
                  canChooseOrder={canChooseOrder}
                  onCardClick={handleOpenUnitCard}
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

      <InitiativeModal
        isOpen={showInitiativeModal}
        isPlayerA={playerSlot === "A"}
        onSelectWinner={(playerId) =>
          dispatchGameEvent("SET_INITIATIVE", { winnerPlayerId: playerId })
        }
        onClose={() => {}}
      />

      <TargetSelectModal
        open={shootModalOpen}
        attacker={selectedUnit}
        targets={opponentUnits}
        primaryTargetId={selectedTargetId}
        secondaryTargetIds={selectedSecondaryIds}
        allowSecondarySelection={hasBlast}
        onSelectPrimary={(id) => {
          setSelectedTargetId(id);
          setSelectedSecondaryIds([]);
        }}
        onToggleSecondary={(id) => {
          setSelectedSecondaryIds((prev) =>
            prev.includes(id)
              ? prev.filter((entry) => entry !== id)
              : [...prev, id],
          );
        }}
        onClose={() => {
          setShootModalOpen(false);
          setSelectedSecondaryIds([]);
          setSelectedTargetId(null);
        }}
        onConfirm={() => {
          if (!selectedTargetId) return;
          const blastInputs = {
            primaryTargetId: selectedTargetId,
            secondaryTargetIds: selectedSecondaryIds,
          };
          const ctx = {
            weapon: selectedWeapon,
            weaponProfile: selectedWeapon,
            weaponRules: normalizeWeaponRules(selectedWeapon),
            inputs: blastInputs,
            modifiers: {},
            log: [],
          };
          runWeaponRuleHook(ctx, "ON_DECLARE_ATTACK");
          const attackQueue = Array.isArray(ctx.attackQueue)
            ? ctx.attackQueue
            : [];
          const firstTargetId = attackQueue[0]?.targetId ?? selectedTargetId;
          setDefenderId(selectedTargetId);
          dispatchCombatEvent("START_RANGED_ATTACK", {
            attackerId: currentPlayerId,
            defenderId: otherPlayerId,
            attackingOperativeId: selectedUnit?.id || null,
            defendingOperativeId: firstTargetId,
            weaponId: selectedWeapon?.name || null,
            weaponProfile: selectedWeapon || null,
            attackQueue,
            inputs: blastInputs,
          });
          setShootModalOpen(false);
          setSelectedSecondaryIds([]);
          setSelectedTargetId(null);
        }}
      />

      <TargetSelectModal
        open={actionFlow?.mode === "fight" && actionFlow?.step === "pickTarget"}
        attacker={fightAttacker}
        targets={fightTargets}
        primaryTargetId={actionFlow?.defenderId ?? null}
        secondaryTargetIds={[]}
        allowSecondarySelection={false}
        confirmLabel="Fight"
        onSelectPrimary={(id) => {
          if (!id || !fightAttacker) return;
          dispatchGameEvent("FLOW_SET_TARGET", { defenderId: id });
        }}
        onToggleSecondary={() => {}}
        onClose={() => {
          if (!canCancelFightFlow) return;
          dispatchGameEvent("FLOW_CANCEL");
        }}
        onConfirm={() => {}}
      />

      {actionFlow?.mode === "fight" && actionFlow?.step === "pickWeapons" && (
        <div className="kt-modal">
          <div
            className="kt-modal__backdrop"
            onClick={() => {
              if (!canCancelFightFlow) return;
              dispatchGameEvent("FLOW_CANCEL");
            }}
          />
          <div className="kt-modal__panel">
            <button
              className="kt-modal__close"
              type="button"
              onClick={() => {
                if (!canCancelFightFlow) return;
                dispatchGameEvent("FLOW_CANCEL");
              }}
              aria-label="Close"
              title="Close"
              disabled={!canCancelFightFlow}
            >
              ×
            </button>
            <div className="kt-modal__layout">
              <aside className="kt-modal__sidebar">
                <div className="kt-modal__sidebar-group">
                  <div className="kt-modal__sidebar-title">Fight: Select Weapons</div>
                  <div className="kt-modal__sidebar-empty">
                    Both sides must ready their melee weapons.
                  </div>
                  {fightReadyRole && (
                    <button
                      className="kt-modal__btn kt-modal__btn--primary"
                      type="button"
                      onClick={() => {
                        dispatchGameEvent("FLOW_LOCK_WEAPON", {
                          role: fightReadyRole,
                        });
                      }}
                      disabled={!canClickFightReady}
                    >
                      {isFightWaiting && (
                        <span className="unit-selector__spinner" aria-hidden="true" />
                      )}
                      READY
                    </button>
                  )}
                  <button
                    className="kt-modal__btn"
                    type="button"
                    onClick={() => {
                      dispatchGameEvent("FLOW_CANCEL");
                    }}
                    disabled={!canCancelFightFlow}
                  >
                    Cancel
                  </button>
                </div>
              </aside>
              <div className="kt-modal__content">
                <div className="kt-modal__header">
                  <div className="kt-modal__title">Fight: Select Weapons</div>
                  <div className="kt-modal__subtitle">
                    {fightAttacker?.name || "Attacker"} vs {fightDefender?.name || "Defender"}
                  </div>
                </div>
                <div className="kt-modal__grid">
                  {renderFightCard(fightAttacker, "Attacker")}
                  {renderFightCard(fightDefender, "Defender")}
                </div>
                <div className="defense-roll__section">
                  <div className="defense-roll__label">Attacker Weapon</div>
                  <select
                    className="defense-roll__field"
                    value={actionFlow?.attackerWeapon || ""}
                    onChange={(event) => {
                      dispatchGameEvent("FLOW_SET_WEAPON", {
                        role: "attacker",
                        weaponName: event.target.value,
                      });
                    }}
                    disabled={!canSelectAttackerWeapon || actionFlow?.locked?.attackerWeapon}
                  >
                    <option value="" disabled>
                      Select melee weapon
                    </option>
                    {fightAttackerWeapons.map((weapon) => (
                      <option key={weapon.name} value={weapon.name}>
                        {weapon.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="defense-roll__section">
                  <div className="defense-roll__label">Defender Weapon</div>
                  <select
                    className="defense-roll__field"
                    value={actionFlow?.defenderWeapon || ""}
                    onChange={(event) => {
                      dispatchGameEvent("FLOW_SET_WEAPON", {
                        role: "defender",
                        weaponName: event.target.value,
                      });
                    }}
                    disabled={!canSelectDefenderWeapon || actionFlow?.locked?.defenderWeapon}
                  >
                    <option value="" disabled>
                      Select melee weapon
                    </option>
                    {fightDefenderWeapons.map((weapon) => (
                      <option key={weapon.name} value={weapon.name}>
                        {weapon.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {actionFlow?.mode === "fight" && actionFlow?.step === "rollDice" && (
        <div className="kt-modal">
          <div
            className="kt-modal__backdrop"
            onClick={() => {
              if (!canCancelFightFlow) return;
              dispatchGameEvent("FLOW_CANCEL");
            }}
          />
          <div className="kt-modal__panel">
            <div className="kt-modal__layout">
              <aside className="kt-modal__sidebar">
                <div className="kt-modal__sidebar-group">
                  <div className="kt-modal__sidebar-title">Fight: Roll Dice</div>
                  <div className="kt-modal__sidebar-empty">
                    Both sides roll and reveal dice.
                  </div>
                  {fightDiceRole && (
                    <button
                      className="kt-modal__btn kt-modal__btn--primary"
                      type="button"
                      onClick={() => {
                        dispatchGameEvent("FLOW_LOCK_DICE", {
                          role: fightDiceRole,
                        });
                      }}
                      disabled={!canClickFightDice}
                    >
                      {isFightDiceWaiting && (
                        <span className="unit-selector__spinner" aria-hidden="true" />
                      )}
                      ROLL DICE
                    </button>
                  )}
                  <button
                    className="kt-modal__btn"
                    type="button"
                    onClick={() => {
                      if (!canCancelFightFlow) return;
                      dispatchGameEvent("FLOW_CANCEL");
                    }}
                    disabled={!canCancelFightFlow}
                  >
                    Cancel
                  </button>
                </div>
              </aside>
              <div className="kt-modal__content">
                <div className="kt-modal__header">
                  <div className="kt-modal__title">Fight: Roll Dice</div>
                  <div className="kt-modal__subtitle">
                    {fightAttacker?.name || "Attacker"} vs {fightDefender?.name || "Defender"}
                  </div>
                </div>
                <div className="kt-modal__grid">
                  {renderFightCard(fightAttacker, "Attacker")}
                  {renderFightCard(fightDefender, "Defender")}
                </div>
                <div className="defense-roll__section">
                  <div className="defense-roll__label">Attacker Dice</div>
                  <div className="defense-roll__dice">
                    {(isFightRolling ? fightRollPreview.attacker : actionFlow?.dice?.attacker?.raw || []).length > 0
                      ? (isFightRolling ? fightRollPreview.attacker : actionFlow.dice.attacker.raw).map((value, index) => (
                          <span key={`atk-${index}`} className="defense-roll__die">
                            {value}
                          </span>
                        ))
                      : "-"}
                  </div>
                  {(actionFlow?.dice?.attacker?.raw || []).length > 0 && (
                    <div className="defense-roll__dice defense-roll__dice--summary">
                      <span className="defense-roll__die defense-roll__die--summary">
                        C {actionFlow?.dice?.attacker?.crit ?? 0}
                      </span>
                      <span className="defense-roll__die defense-roll__die--summary">
                        H {actionFlow?.dice?.attacker?.norm ?? 0}
                      </span>
                    </div>
                  )}
                </div>
                <div className="defense-roll__section">
                  <div className="defense-roll__label">Defender Dice</div>
                  <div className="defense-roll__dice">
                    {(isFightRolling ? fightRollPreview.defender : actionFlow?.dice?.defender?.raw || []).length > 0
                      ? (isFightRolling ? fightRollPreview.defender : actionFlow.dice.defender.raw).map((value, index) => (
                          <span key={`def-${index}`} className="defense-roll__die">
                            {value}
                          </span>
                        ))
                      : "-"}
                  </div>
                  {(actionFlow?.dice?.defender?.raw || []).length > 0 && (
                    <div className="defense-roll__dice defense-roll__dice--summary">
                      <span className="defense-roll__die defense-roll__die--summary">
                        C {actionFlow?.dice?.defender?.crit ?? 0}
                      </span>
                      <span className="defense-roll__die defense-roll__die--summary">
                        H {actionFlow?.dice?.defender?.norm ?? 0}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {actionFlow?.mode === "fight" &&
        (actionFlow?.step === "resolve" || actionFlow?.step === "summary") && (
        <div
          className={`kt-modal ${
            actionFlow?.step === "resolve" && actionFlow?.resolve?.turn
              ? "kt-modal--turn-glow"
              : ""
          }`}
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

      <DiceInputModal
        open={attackModalOpen}
        attacker={attackingOperative}
        defender={defendingOperative}
        weaponProfile={combatState?.weaponProfile || selectedWeapon}
        attackDiceCount={selectedWeapon?.atk ?? 0}
        defenseDiceCount={3}
        attackHitThreshold={selectedWeapon?.hit ?? 6}
        hasCeaseless={hasCeaseless}
        hasBalanced={hasBalanced}
        accurateMax={getAccurateMax(
          combatState?.weaponProfile || selectedWeapon,
        )}
        combatInputs={combatState?.inputs}
        combatStage={combatState?.stage}
        combatAttackRoll={combatState?.attackRoll}
        combatDefenseRoll={combatState?.defenseRoll}
        combatSummary={combatSummary}
        onSetCombatAttackRoll={(roll, inputs) => {
          dispatchCombatEvent("SET_ATTACK_ROLL", { roll, inputs });
        }}
        onSetCombatInputs={(inputs) => {
          dispatchCombatEvent("SET_COMBAT_INPUTS", { inputs });
        }}
        onLockAttack={(payload) => {
          // payload comes from DiceInputModal handleLockInAttackClick
          // { targetId, woundsCurrent, woundsMax, combatEnded, killed, log, modifiers }

          const defenderUnit = defendingOperative;

          // 1) Apply Devastating damage immediately (if present)
          const dmg = Number(payload?.modifiers?.devastatingDamage ?? 0);
          if (defenderUnit?.id && dmg > 0) {
            const oldHealth = Number(defenderUnit?.state?.woundsCurrent);
            const fallbackOldHealth = Number(payload?.woundsCurrent ?? 0) + dmg;
            const safeOldHealth = Number.isFinite(oldHealth)
              ? oldHealth
              : fallbackOldHealth;
            const newHealth = Number.isFinite(Number(payload?.woundsCurrent))
              ? Number(payload?.woundsCurrent)
              : Math.max(0, safeOldHealth - dmg);

            dispatchDamageEvent(defenderUnit.id, dmg);

          }

          // 2) If Devastating killed the target, end combat immediately
          if (payload?.killed || payload?.combatEnded) {
            dispatchCombatEvent("RESOLVE_COMBAT");

            const queue = combatState?.attackQueue || [];
            const idx = combatState?.currentAttackIndex ?? 0;
            if (queue.length > 0 && idx < queue.length - 1) {
              dispatchCombatEvent("ADVANCE_ATTACK_QUEUE");
            } else {
              dispatchCombatEvent("CLEAR_COMBAT_STATE");
            }
            return;
          }

          // 3) Otherwise proceed as normal: lock attack and wait for defense
          dispatchCombatEvent("LOCK_ATTACK_ROLL", {
            ruleLog: payload?.log ?? [],
            modifiers: payload?.modifiers ?? {},
          });
        }}
        readOnly={combatState?.stage !== COMBAT_STAGES.ATTACK_ROLLING}
        statusMessage={
          combatState?.stage === COMBAT_STAGES.ATTACK_LOCKED
            ? "Attack locked in. Waiting for defense..."
            : combatState?.stage === COMBAT_STAGES.DEFENSE_ROLLING
              ? "Defense rolling..."
              : combatState?.stage === COMBAT_STAGES.BLOCKS_RESOLVING
                ? "Defender is assigning blocks..."
                : combatState?.stage === COMBAT_STAGES.READY_TO_RESOLVE_DAMAGE
                  ? "Ready to resolve damage."
                  : combatState?.stage === COMBAT_STAGES.DONE
                    ? "Combat resolved."
                    : null
        }
        onAutoRoll={({ attackBefore, defenseDice, ceaseless }) => {
        }}
        onClose={() => {
          dispatchCombatEvent("CLEAR_COMBAT_STATE");
        }}
        onConfirm={({ attackDice, defenseDice, ceaseless, autoLogged }) => {
          if (combatState?.stage === COMBAT_STAGES.READY_TO_RESOLVE_DAMAGE) {
            const weapon = combatState?.weaponProfile;
            const attackerUnit = attackingOperative;
            const defenderUnit = defendingOperative;
            const blocks = combatState?.blocks;
            const remainingHits = blocks?.remainingHits ?? 0;
            const remainingCrits = blocks?.remainingCrits ?? 0;
            const [normalDmg, critDmg] = weapon?.dmg
              ?.split("/")
              .map(Number) ?? [0, 0];
            const safeNormalDmg = Number.isFinite(normalDmg) ? normalDmg : 0;
            const safeCritDmg = Number.isFinite(critDmg) ? critDmg : 0;
            const totalDamage =
              remainingHits * safeNormalDmg + remainingCrits * safeCritDmg;

            if (defenderUnit?.id) {
              dispatchDamageEvent(defenderUnit.id, totalDamage);
            }

            dispatchCombatEvent("RESOLVE_COMBAT");
            const queue = combatState?.attackQueue || [];
            const idx = combatState?.currentAttackIndex ?? 0;
            if (queue.length > 0 && idx < queue.length - 1) {
              dispatchCombatEvent("ADVANCE_ATTACK_QUEUE");
            } else {
              dispatchCombatEvent("CLEAR_COMBAT_STATE");
            }
            return;
          }

          setPendingAttack({
            attacker,
            defender,
            weapon: selectedWeapon,
            attackDice,
            defenseDice,
          });

          setAllocationModalOpen(true);
        }}
      />

      <DefenseRollModal
        open={defenseModalOpen}
        stage={combatState?.stage}
        attacker={attackingOperative}
        defender={defendingOperative}
        weaponProfile={combatState?.weaponProfile || selectedWeapon}
        attackRoll={combatState?.attackRoll}
        combatSummary={combatSummary}
        defenseDiceCount={3}
        onClose={() => {
          dispatchCombatEvent("CLEAR_COMBAT_STATE");
        }}
        readOnly={combatState?.stage !== COMBAT_STAGES.DEFENSE_ROLLING}
        statusMessage={
          combatState?.stage === COMBAT_STAGES.ATTACK_ROLLING
            ? "Waiting for attacker to lock in…"
            : combatState?.stage === COMBAT_STAGES.ATTACK_LOCKED
              ? "Attacker locked in. Preparing defense roll…"
              : combatState?.stage === COMBAT_STAGES.DEFENSE_ROLLING
                ? "Roll defense dice."
                : combatState?.stage === COMBAT_STAGES.READY_TO_RESOLVE_DAMAGE
                  ? "Waiting for attacker to resolve…"
                  : combatState?.stage === COMBAT_STAGES.DONE
                    ? "Combat resolved."
                    : null
        }
        onSetDefenseRoll={(roll) => {
          dispatchCombatEvent("SET_DEFENSE_ROLL", { roll });
        }}
        onLockDefense={() => {
          dispatchCombatEvent("LOCK_DEFENSE_ROLL");
        }}
      />

      <DefenseAllocationModal
        open={blocksModalOpen || allocationModalOpen}
        attacker={attackingOperative || pendingAttack?.attacker}
        defender={defendingOperative || pendingAttack?.defender}
        weapon={combatState?.weaponProfile || pendingAttack?.weapon}
        attackDice={combatState?.attackRoll ?? pendingAttack?.attackDice ?? []}
        defenseDice={
          combatState?.defenseRoll ?? pendingAttack?.defenseDice ?? []
        }
        hitThreshold={
          (combatState?.weaponProfile || pendingAttack?.weapon)?.hit ?? 6
        }
        saveThreshold={
          (defendingOperative || pendingAttack?.defender)?.stats?.save ?? 6
        }
        attackCritThreshold={getAttackCritThreshold(
          combatState?.weaponProfile || pendingAttack?.weapon || selectedWeapon,
        )}
        onClose={() => {
          if (blocksModalOpen) {
            dispatchCombatEvent("CLEAR_COMBAT_STATE");
            return;
          }
          setAllocationModalOpen(false);
          setPendingAttack(null);
        }}
        onConfirm={({
          remainingHits,
          remainingCrits,
          defenseEntries,
          attackEntries,
        }) => {
          if (blocksModalOpen) {
            dispatchCombatEvent("SET_BLOCKS_RESULT", {
              blocks: {
                remainingHits,
                remainingCrits,
                defenseEntries,
                attackEntries,
              },
            });
            return;
          }
          const weapon = pendingAttack?.weapon;
          const attacker = pendingAttack?.attacker;
          const defender = pendingAttack?.defender;
          const [normalDmg, critDmg] = weapon?.dmg?.split("/").map(Number) ?? [
            0, 0,
          ];
          const safeNormalDmg = Number.isFinite(normalDmg) ? normalDmg : 0;
          const safeCritDmg = Number.isFinite(critDmg) ? critDmg : 0;
          const totalDamage =
            remainingHits * safeNormalDmg + remainingCrits * safeCritDmg;
          const hits = attackEntries.filter((d) => d.type === "hit").length;
          const crits = attackEntries.filter((d) => d.type === "crit").length;
          const defenseHits = defenseEntries.filter(
            (d) => d.type === "hit",
          ).length;
          const defenseCrits = defenseEntries.filter(
            (d) => d.type === "crit",
          ).length;
          const savesUsed = defenseHits + defenseCrits;

          if (defender?.id) {
            dispatchDamageEvent(defender.id, totalDamage);
          }

          setAllocationModalOpen(false);
          setPendingAttack(null);
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

function ArmyOverlayRoute() {
  const location = useLocation();
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
  const armyKeyA =
    location.state?.armyKeyA ||
    (slot === "A" ? armyKey : undefined) ||
    storedArmyKeyA ||
    armyKey;
  const armyKeyB =
    location.state?.armyKeyB ||
    (slot === "B" ? armyKey : undefined) ||
    storedArmyKeyB ||
    armyKey;
  const selectedUnitIds = location.state?.selectedUnitIds;
  const selectedUnitIdsA =
    location.state?.selectedUnitIdsA ||
    (slot === "A" ? selectedUnitIds : undefined) ||
    storedUnitIdsA;
  const selectedUnitIdsB =
    location.state?.selectedUnitIdsB ||
    (slot === "B" ? selectedUnitIds : undefined) ||
    storedUnitIdsB;

  const selectedWeaponsByUnitId = location.state?.selectedWeaponsByUnitId;
  const selectedWeaponsByUnitIdA =
    location.state?.selectedWeaponsByUnitIdA ||
    (slot === "A" ? selectedWeaponsByUnitId : undefined) ||
    storedWeaponsA;
  const selectedWeaponsByUnitIdB =
    location.state?.selectedWeaponsByUnitIdB ||
    (slot === "B" ? selectedWeaponsByUnitId : undefined) ||
    storedWeaponsB;

  const teamA = armies.find((army) => army.key === armyKeyA) || armies[0];
  const teamB = armies.find((army) => army.key === armyKeyB) || teamA;

  const filteredUnitsA = Array.isArray(selectedUnitIdsA)
    ? teamA.units.filter((unit) => selectedUnitIdsA.includes(unit.id))
    : teamA.units;

  const filteredUnitsB = Array.isArray(selectedUnitIdsB)
    ? teamB.units.filter((unit) => selectedUnitIdsB.includes(unit.id))
    : teamB.units;

  const buildTeamUnits = (units, teamId, weaponSelections) =>
    units.map((unit) => {
      const selectedWeaponNames = Array.isArray(weaponSelections?.[unit.id])
        ? weaponSelections[unit.id]
        : null;
      const filteredWeapons = Array.isArray(unit.weapons)
        ? selectedWeaponNames && selectedWeaponNames.length > 0
          ? unit.weapons.filter((weapon) =>
              selectedWeaponNames.includes(weapon.name),
            )
          : unit.weapons
        : [];

      return {
        ...unit,
        id: `${teamId}:${unit.id}`,
        baseId: unit.id,
        teamId,
        owner: teamId === "alpha" ? "A" : "B",
        stats: { ...unit.stats },
        state: {
          ...unit.state,
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
    ...buildTeamUnits(filteredUnitsA, "alpha", selectedWeaponsByUnitIdA),
    ...buildTeamUnits(filteredUnitsB, "beta", selectedWeaponsByUnitIdB),
  ];

  return (
    <GameOverlay
      key={`${teamA?.key || "team-a"}-${teamB?.key || "team-b"}`}
      initialUnits={combinedUnits}
      playerSlot={slot}
      gameCode={gameCode}
      teamKeys={{ alpha: teamA?.key, beta: teamB?.key }}
    />
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
      <Route path="/:username/army" element={<ArmyOverlayRoute />} />
      <Route path="/:username/army/unit/:unitId" element={<UnitCardFocused />} />
      <Route path="*" element={<Navigate to="/multiplayer" replace />} />
    </Routes>
  );
}

export default App;
