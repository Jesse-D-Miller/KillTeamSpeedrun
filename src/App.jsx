import "./App.css";
import UnitCard from "./ui/components/UnitCard";
import UnitListNav from "./ui/components/UnitListNav";
import LogsWindow from "./ui/components/LogsWindow";
import Actions from "./ui/components/Actions";
import TopBar from "./ui/components/TopBar";
import InitiativeModal from "./ui/components/InitiativeModal";
import TargetSelectModal from "./ui/components/TargetSelectModal";
import DiceInputModal from "./ui/components/DiceInputModal";
import DefenseAllocationModal from "./ui/components/DefenseAllocationModal";
import DefenseRollModal from "./ui/components/DefenseRollModal";
import Login from "./ui/screens/Login";
import ArmySelector from "./ui/screens/ArmySelector";
import UnitSelector from "./ui/screens/UnitSelector";
import MultiplayerLobby from "./ui/screens/MultiplayerLobby";
import {
  gameReducer,
  initialCombatState,
  COMBAT_STAGES,
} from "./state/gameReducer";
import { createLogEntry } from "./state/actionCreator";
import { resolveAttack } from "./engine/rules/resolveAttack";
import {
  normalizeWeaponRules,
  runWeaponRuleHook,
} from "./engine/rules/weaponRules";
import {
  canCounteract,
  getExpendedEngageOperatives,
  getReadyOperatives,
} from "./state/gameLoopSelectors";
import { useEffect, useReducer, useRef, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
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

const armies = Object.entries(killteamModules).map(([path, data]) => ({
  key: getArmyKey(path),
  name: getArmyKey(path).replace(/[-_]+/g, " "),
  units: normalizeKillteamData(data),
}));

const generateClientId = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

function GameOverlay({ initialUnits, playerSlot, gameCode }) {
  const [state, dispatch] = useReducer(gameReducer, {
    gameId: generateClientId(),
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
  const seenLogIdsRef = useRef(new Set());
  const seenDamageIdsRef = useRef(new Set());
  const seenCombatIdsRef = useRef(new Set());
  const seenGameIdsRef = useRef(new Set());
  const [attackerId, setAttackerId] = useState(null);
  const [defenderId, setDefenderId] = useState(null);
  const [leftTab, setLeftTab] = useState("units");
  const [shootModalOpen, setShootModalOpen] = useState(false);
  const [selectedTargetId, setSelectedTargetId] = useState(null);
  const [selectedSecondaryIds, setSelectedSecondaryIds] = useState([]);
  const autoSelectTargetRef = useRef(false);
  const [allocationModalOpen, setAllocationModalOpen] = useState(false);
  const [pendingAttack, setPendingAttack] = useState(null);
  const [intentGate, setIntentGate] = useState({
    open: false,
    issues: [],
    pending: null,
  });

  const logEntry = ({ type, summary, meta }) => {
    const entry = createLogEntry({
      type,
      summary,
      meta,
      undo: state.game,
      redo: state.game,
    });
    dispatchIntent({ type: "LOG_PUSH", payload: entry });
  };

  const formatDiceList = (dice = []) => dice.join(", ");

  const logRollSequence = ({ attackBefore, defenseDice, ceaseless }) => {
    const localPlayerId = getOrCreatePlayerId();
    const attackRoller = playerSlot || localPlayerId;
    const defenseRoller = playerSlot
      ? playerSlot === "A"
        ? "B"
        : "A"
      : "opponent";

    logEntry({
      type: "ATTACK_DICE",
      summary: `${attackRoller} ATTACK: ${formatDiceList(attackBefore)}`,
      meta: {
        playerId: localPlayerId,
        roller: attackRoller,
        attackerId: selectedUnit?.id,
        weaponName: selectedWeapon?.name,
        dice: attackBefore,
      },
    });

    if (ceaseless?.rerolled?.length) {
      logEntry({
        type: "CEASELESS_REROLL",
        summary: `${attackRoller} CEASELESS: ${formatDiceList(ceaseless.after)} (${ceaseless.rerolled.length} die rerolled)`,
        meta: {
          playerId: localPlayerId,
          roller: attackRoller,
          attackerId: selectedUnit?.id,
          weaponName: selectedWeapon?.name,
          before: ceaseless.before,
          after: ceaseless.after,
          rerolled: ceaseless.rerolled,
          value: ceaseless.value,
        },
      });
    }

    logEntry({
      type: "DEFENSE_DICE",
      summary: `${defenseRoller} DEFENSE: ${formatDiceList(defenseDice)}`,
      meta: {
        playerId: localPlayerId,
        roller: defenseRoller,
        defenderId: selectedTargetId,
        dice: defenseDice,
      },
    });
  };

  const logDefenseRoll = (dice) => {
    if (!Array.isArray(dice) || dice.length === 0) return;
    const localPlayerId = getOrCreatePlayerId();
    const defenseRoller = playerSlot
      ? playerSlot === "A"
        ? "B"
        : "A"
      : "opponent";
    logEntry({
      type: "DEFENSE_DICE",
      summary: `${defenseRoller} DEFENSE: ${formatDiceList(dice)}`,
      meta: {
        playerId: localPlayerId,
        roller: defenseRoller,
        defenderId: combatState?.defendingOperativeId,
        dice,
      },
    });
  };

  const [selectedUnitId, setSelectedUnitId] = useState(
    initialUnits?.[0]?.id ?? null,
  );

  const attacker = state.game.find((u) => u.id === attackerId);
  const defender = state.game.find((u) => u.id === defenderId);
  const teamAUnits = state.game.filter((unit) => unit.teamId === "alpha");
  const teamBUnits = state.game.filter((unit) => unit.teamId === "beta");
  const myTeamId = playerSlot === "B" ? "beta" : "alpha";
  const myTeamUnits = myTeamId === "alpha" ? teamAUnits : teamBUnits;
  const selectedUnit =
    myTeamUnits.find((u) => u.id === selectedUnitId) ?? myTeamUnits[0] ?? null;
  const attackerTeamId = selectedUnit?.teamId || myTeamId;
  const opponentUnits = attackerTeamId === "alpha" ? teamBUnits : teamAUnits;
  const cp = 0;
  const vp = 0;
  const turningPoint = state.turningPoint ?? 0;
  const phase = state.phase ?? "SETUP";

  const loopPlayerId = playerSlot || "A";
  const isFirefight = phase === "FIREFIGHT";
  const isMyTurn = state.firefight?.activePlayerId === loopPlayerId;
  const readyOperatives = getReadyOperatives(state, loopPlayerId);
  const hasReadyOperatives = readyOperatives.length > 0;
  const counteractOperatives = getExpendedEngageOperatives(state, loopPlayerId);
  const canCounteractNow = canCounteract(state, loopPlayerId);
  const hasActiveOperative = Boolean(state.firefight?.activeOperativeId);
  const selectedIsReady =
    selectedUnit?.owner === loopPlayerId &&
    selectedUnit?.state?.readyState === "READY";
  const showActivate =
    isFirefight &&
    isMyTurn &&
    hasReadyOperatives &&
    !hasActiveOperative &&
    selectedIsReady;
  const showActionButtons =
    isFirefight &&
    state.firefight?.activeOperativeId === selectedUnit?.id &&
    state.firefight?.orderChosenThisActivation;
  const showCounteract =
    isFirefight &&
    isMyTurn &&
    !hasReadyOperatives &&
    canCounteractNow;
  const statusMessage =
    isFirefight &&
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

  const lastTpStartRef = useRef(null);

  useEffect(() => {
    if (phase !== "STRATEGY") return;
    if (!Number.isFinite(Number(turningPoint)) || turningPoint <= 0) return;
    if (lastTpStartRef.current === turningPoint) return;
    dispatchIntent({
      type: "TURNING_POINT_START",
      payload: { turningPoint },
    });
    lastTpStartRef.current = turningPoint;
  }, [phase, turningPoint]);

  useEffect(() => {
    if (state.phase !== "SETUP") return;
    if (!gameCode) return;
    const readyA = localStorage.getItem(`kt_game_${gameCode}_ready_A`) === "true";
    const readyB = localStorage.getItem(`kt_game_${gameCode}_ready_B`) === "true";
    if (!readyA || !readyB) return;
    if (!state.setup?.teamsLocked) {
      dispatchIntent({ type: "LOCK_TEAMS" });
    }
    if (!state.setup?.deploymentComplete) {
      dispatchIntent({ type: "DEPLOY_OPERATIVES" });
    }
    if (state.setup?.teamsLocked && state.setup?.deploymentComplete) {
      dispatchIntent({ type: "BEGIN_BATTLE" });
    }
  }, [state.phase, state.setup?.teamsLocked, state.setup?.deploymentComplete, gameCode]);

  useEffect(() => {
    if (!shootModalOpen) return;
    if (
      opponentUnits.length > 0 &&
      !selectedTargetId &&
      !autoSelectTargetRef.current
    ) {
      setSelectedTargetId(opponentUnits[0].id);
      autoSelectTargetRef.current = true;
    }
  }, [shootModalOpen, opponentUnits, selectedTargetId]);

  useEffect(() => {
    if (shootModalOpen) return;
    autoSelectTargetRef.current = false;
  }, [shootModalOpen]);

  const currentPlayerId = playerSlot || getOrCreatePlayerId();
  const otherPlayerId = playerSlot ? (playerSlot === "A" ? "B" : "A") : null;
  const showInitiativeModal =
    phase === "STRATEGY" && !state.initiativePlayerId;
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
  const fightAttackerWeapon = fightAttackerWeapons.find(
    (weapon) => weapon.name === actionFlow?.attackerWeapon,
  );
  const fightDefenderWeapon = fightDefenderWeapons.find(
    (weapon) => weapon.name === actionFlow?.defenderWeapon,
  );
  const canCancelFightFlow =
    actionFlow?.mode === "fight" &&
    ["pickTarget", "pickWeapons", "rollDice"].includes(actionFlow?.step) &&
    !actionFlow?.locked?.attackerWeapon &&
    !actionFlow?.locked?.defenderWeapon &&
    !actionFlow?.locked?.diceRolled;

  const showIssues = (result, event) =>
    setIntentGate({
      open: true,
      issues: result.issues,
      pending: event,
    });

  const dispatchIntent = (event, options = {}) => {
    const result = validateGameIntent(state, event);
    if (result.ok || options.override) {
      dispatch(event);
      return;
    }
    showIssues(result, event);
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

  const sendMultiplayerEvent = (kind, payload = {}) => {
    if (!gameCode || !playerSlot) return;
    const event = {
      id:
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      ts: Date.now(),
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
    dispatchIntent({ type, payload });
    const event = sendMultiplayerEvent("COMBAT_EVENT", { type, payload });
    if (event?.id) {
      seenCombatIdsRef.current.add(event.id);
    }
  };

  const dispatchGameEvent = (type, payload = {}) => {
    dispatchIntent({ type, payload });
    const event = sendMultiplayerEvent("GAME_EVENT", { type, payload });
    if (event?.id) {
      seenGameIdsRef.current.add(event.id);
    }
  };

  const applyRemoteLogEvent = (event) => {
    if (!event || event.kind !== "LOG_ENTRY") return;
    const entry = event.payload?.entry;
    if (!entry?.id) return;
    if (seenLogIdsRef.current.has(entry.id)) return;
    seenLogIdsRef.current.add(entry.id);
    dispatch({ type: "LOG_PUSH", payload: entry });
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
    });
  };

  const applyRemoteCombatEvent = (event) => {
    if (!event || event.kind !== "COMBAT_EVENT") return;
    if (!event.id || seenCombatIdsRef.current.has(event.id)) return;
    const { type, payload } = event.payload || {};
    if (!type) return;
    seenCombatIdsRef.current.add(event.id);
    dispatch({ type, payload });
  };

  const applyRemoteGameEvent = (event) => {
    if (!event || event.kind !== "GAME_EVENT") return;
    if (!event.id || seenGameIdsRef.current.has(event.id)) return;
    const { type, payload } = event.payload || {};
    if (!type) return;
    seenGameIdsRef.current.add(event.id);
    dispatch({ type, payload });
  };

  useEffect(() => {
    if (!gameCode || !playerSlot) return undefined;

    const socket = connectWS({
      code: gameCode,
      playerId: getOrCreatePlayerId(),
      onMessage: (message) => {
        if (message.type === "SNAPSHOT" && Array.isArray(message.eventLog)) {
          message.eventLog.forEach((event) => {
            applyRemoteLogEvent(event);
            applyRemoteDamageEvent(event);
            applyRemoteCombatEvent(event);
            applyRemoteGameEvent(event);
          });
          return;
        }
        if (message.type === "EVENT" && message.event) {
          applyRemoteLogEvent(message.event);
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

  useEffect(() => {
    if (!gameCode || !playerSlot) return;
    const entry = state.log.entries[state.log.cursor - 1];
    if (!entry?.id) return;
    if (seenLogIdsRef.current.has(entry.id)) return;
    seenLogIdsRef.current.add(entry.id);

    const sanitizedEntry = {
      ...entry,
      undo: null,
      redo: null,
    };

    sendMultiplayerEvent("LOG_ENTRY", { entry: sanitizedEntry });
  }, [state.log.cursor, state.log.entries, gameCode, playerSlot]);

  return (
    <div className="App">
      <div className="kt-shell">
        <aside className="kt-nav">
          <div className="kt-nav__tabs">
            <button
              type="button"
              className={`kt-nav__tab ${leftTab === "units" ? "kt-nav__tab--active" : ""}`}
              onClick={() => setLeftTab("units")}
            >
              Units
            </button>
            <button
              type="button"
              className={`kt-nav__tab ${leftTab === "log" ? "kt-nav__tab--active" : ""}`}
              onClick={() => setLeftTab("log")}
            >
              Log
            </button>
          </div>

          {leftTab === "units" ? (
            <UnitListNav
              units={myTeamUnits}
              selectedUnitId={selectedUnit?.id}
              onSelectUnit={setSelectedUnitId}
            />
          ) : (
            <LogsWindow
              entries={state.log.entries}
              cursor={state.log.cursor}
              onUndo={() => dispatchIntent({ type: "UNDO" })}
              onRedo={() => dispatchIntent({ type: "REDO" })}
            />
          )}
        </aside>
        <div className="kt-main">
          <TopBar
            cp={cp}
            vp={vp}
            turningPoint={turningPoint}
            phase={phase}
            initiativePlayerId={state.initiativePlayerId}
          />

          <main className="kt-detail">
            {selectedUnit ? (
              <>
                <UnitCard
                  key={selectedUnit.id}
                  unit={selectedUnit}
                  dispatch={dispatchIntent}
                  onLog={logEntry}
                />
                {isFirefight && (
                  <Actions
                    attacker={selectedUnit}
                    actionMarks={selectedUnit?.state?.actionMarks}
                    showActivate={showActivate}
                    onActivate={() => {
                      if (!selectedUnit?.id) return;
                      dispatchIntent({
                        type: "SET_ACTIVE_OPERATIVE",
                        payload: {
                          playerId: loopPlayerId,
                          operativeId: selectedUnit.id,
                        },
                      });
                    }}
                    showActionButtons={showActionButtons}
                    onAction={(actionKey) => {
                      if (!selectedUnit?.id) return;

                      dispatchIntent({
                        type: "ACTION_USE",
                        payload: { operativeId: selectedUnit.id, actionKey },
                      });

                      if (actionKey !== "shoot") return;
                      if (!canShoot) {
                        logEntry({
                          type: "ACTION_REJECTED",
                          summary: `${selectedUnit?.name || "Unit"} cannot Shoot — selected weapon is not ranged`,
                          meta: {
                            unitId: selectedUnit?.id,
                            weaponName: selectedWeapon?.name,
                          },
                        });
                        return;
                      }
                      if (opponentUnits.length === 0) return;
                      setAttackerId(selectedUnit.id);
                      setShootModalOpen(true);
                    }}
                    showCounteract={showCounteract}
                    onCounteract={() => {
                      const target =
                        counteractOperatives.find((op) => op.id === selectedUnit?.id) ||
                        counteractOperatives[0];
                      if (!target) return;
                      dispatchIntent({
                        type: "COUNTERACT",
                        payload: {
                          playerId: loopPlayerId,
                          operativeId: target.id,
                          action: null,
                        },
                      });
                    }}
                    statusMessage={statusMessage}
                  />
                )}
              </>
            ) : (
              <div className="kt-empty">No units loaded</div>
            )}
          </main>
        </div>
      </div>

      <InitiativeModal
        isOpen={showInitiativeModal}
        isPlayerA={playerSlot === "A"}
        onSelectWinner={(playerId) =>
          dispatchGameEvent("SET_INITIATIVE", { playerId })
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
          logEntry({
            type: "SHOOT_DECLARED",
            summary: `${selectedUnit?.name || "Attacker"} declared Shoot vs ${opponentUnits.find((u) => u.id === selectedTargetId)?.name || "defender"}`,
            meta: {
              attackerId: selectedUnit?.id,
              defenderId: selectedTargetId,
            },
          });
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
        onSelectPrimary={(id) => {
          if (!id || !fightAttacker) return;
          dispatchIntent({
            type: "FLOW_SET_TARGET",
            payload: { defenderId: id },
          });
          const defenderUnit = fightTargets.find((unit) => unit.id === id);
          logEntry({
            type: "FIGHT_TARGET",
            summary: `TARGET:${fightAttacker.name} -> ${defenderUnit?.name || "defender"}`,
            meta: {
              attackerId: fightAttacker.id,
              defenderId: id,
            },
          });
        }}
        onToggleSecondary={() => {}}
        onClose={() => {
          if (!canCancelFightFlow) return;
          dispatchIntent({ type: "FLOW_CANCEL" });
        }}
        onConfirm={() => {}}
      />

      {actionFlow?.mode === "fight" && actionFlow?.step === "pickWeapons" && (
        <div className="kt-modal">
          <div
            className="kt-modal__backdrop"
            onClick={() => {
              if (!canCancelFightFlow) return;
              dispatchIntent({ type: "FLOW_CANCEL" });
            }}
          />
          <div className="kt-modal__panel">
            <button
              className="kt-modal__close"
              type="button"
              onClick={() => {
                if (!canCancelFightFlow) return;
                dispatchIntent({ type: "FLOW_CANCEL" });
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
                  <button
                    className="kt-modal__btn kt-modal__btn--primary"
                    type="button"
                    onClick={() => {
                      dispatchIntent({
                        type: "FLOW_LOCK_WEAPON",
                        payload: { role: "attacker" },
                      });
                    }}
                    disabled={!actionFlow?.attackerWeapon || actionFlow?.locked?.attackerWeapon}
                  >
                    Attacker Ready
                  </button>
                  <button
                    className="kt-modal__btn kt-modal__btn--primary"
                    type="button"
                    onClick={() => {
                      dispatchIntent({
                        type: "FLOW_LOCK_WEAPON",
                        payload: { role: "defender" },
                      });
                    }}
                    disabled={!actionFlow?.defenderWeapon || actionFlow?.locked?.defenderWeapon}
                  >
                    Defender Ready
                  </button>
                  <button
                    className="kt-modal__btn"
                    type="button"
                    onClick={() => {
                      dispatchIntent({ type: "FLOW_CANCEL" });
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
                <div className="defense-roll__section">
                  <div className="defense-roll__label">Attacker Weapon</div>
                  <select
                    className="defense-roll__field"
                    value={actionFlow?.attackerWeapon || ""}
                    onChange={(event) => {
                      dispatchIntent({
                        type: "FLOW_SET_WEAPON",
                        payload: {
                          role: "attacker",
                          weaponName: event.target.value,
                        },
                      });
                    }}
                    disabled={actionFlow?.locked?.attackerWeapon}
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
                      dispatchIntent({
                        type: "FLOW_SET_WEAPON",
                        payload: {
                          role: "defender",
                          weaponName: event.target.value,
                        },
                      });
                    }}
                    disabled={actionFlow?.locked?.defenderWeapon}
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
              dispatchIntent({ type: "FLOW_CANCEL" });
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
                  <button
                    className="kt-modal__btn kt-modal__btn--primary"
                    type="button"
                    onClick={() => {
                      const attackerHit = Number(fightAttackerWeapon?.hit ?? 6);
                      const defenderHit = Number(fightDefenderWeapon?.hit ?? 6);
                      const attackerAtk = Number(fightAttackerWeapon?.atk ?? 0);
                      const defenderAtk = Number(fightDefenderWeapon?.atk ?? 0);
                      const roll = (count) =>
                        Array.from({ length: Math.max(0, count) }, () =>
                          1 + Math.floor(Math.random() * 6),
                        );
                      const countResults = (raw, hit) => {
                        const crit = raw.filter((v) => v === 6).length;
                        const norm = raw.filter(
                          (v) => v >= hit && v !== 6,
                        ).length;
                        return { raw, crit, norm };
                      };

                      const attackerRaw = roll(attackerAtk);
                      const defenderRaw = roll(defenderAtk);

                      dispatchIntent({
                        type: "FLOW_ROLL_DICE",
                        payload: {
                          attacker: countResults(attackerRaw, attackerHit),
                          defender: countResults(defenderRaw, defenderHit),
                        },
                      });
                    }}
                    disabled={actionFlow?.locked?.diceRolled}
                  >
                    Roll Dice
                  </button>
                  <button
                    className="kt-modal__btn"
                    type="button"
                    onClick={() => {
                      if (!canCancelFightFlow) return;
                      dispatchIntent({ type: "FLOW_CANCEL" });
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
                <div className="defense-roll__section">
                  <div className="defense-roll__label">Attacker Dice</div>
                  <div className="defense-roll__dice">
                    {(actionFlow?.dice?.attacker?.raw || []).length > 0
                      ? actionFlow.dice.attacker.raw.map((value, index) => (
                          <span key={`atk-${index}`} className="defense-roll__die">
                            {value}
                          </span>
                        ))
                      : "-"}
                  </div>
                  <div className="defense-roll__dice defense-roll__dice--summary">
                    <span className="defense-roll__die defense-roll__die--summary">
                      C {actionFlow?.dice?.attacker?.crit ?? 0}
                    </span>
                    <span className="defense-roll__die defense-roll__die--summary">
                      H {actionFlow?.dice?.attacker?.norm ?? 0}
                    </span>
                  </div>
                </div>
                <div className="defense-roll__section">
                  <div className="defense-roll__label">Defender Dice</div>
                  <div className="defense-roll__dice">
                    {(actionFlow?.dice?.defender?.raw || []).length > 0
                      ? actionFlow.dice.defender.raw.map((value, index) => (
                          <span key={`def-${index}`} className="defense-roll__die">
                            {value}
                          </span>
                        ))
                      : "-"}
                  </div>
                  <div className="defense-roll__dice defense-roll__dice--summary">
                    <span className="defense-roll__die defense-roll__die--summary">
                      C {actionFlow?.dice?.defender?.crit ?? 0}
                    </span>
                    <span className="defense-roll__die defense-roll__die--summary">
                      H {actionFlow?.dice?.defender?.norm ?? 0}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {actionFlow?.mode === "fight" && actionFlow?.step === "resolve" && (
        <div className="kt-modal">
          <div className="kt-modal__backdrop" />
          <div className="kt-modal__panel">
            <div className="kt-modal__layout">
              <aside className="kt-modal__sidebar">
                <div className="kt-modal__sidebar-group">
                  <div className="kt-modal__sidebar-title">Fight: Resolve</div>
                  <div className="kt-modal__sidebar-empty">
                    Turn: {actionFlow?.resolve?.turn}
                  </div>
                </div>
              </aside>
              <div className="kt-modal__content">
                <div className="kt-modal__header">
                  <div className="kt-modal__title">Fight: Resolve</div>
                  <div className="kt-modal__subtitle">
                    {fightAttacker?.name || "Attacker"} vs {fightDefender?.name || "Defender"}
                  </div>
                </div>

                <div className="defense-roll__section">
                  <div className="defense-roll__label">Attacker Remaining</div>
                  <div className="defense-roll__dice defense-roll__dice--summary">
                    <span className="defense-roll__die defense-roll__die--summary">
                      C {actionFlow?.remaining?.attacker?.crit ?? 0}
                    </span>
                    <span className="defense-roll__die defense-roll__die--summary">
                      H {actionFlow?.remaining?.attacker?.norm ?? 0}
                    </span>
                  </div>
                </div>

                <div className="defense-roll__section">
                  <div className="defense-roll__label">Defender Remaining</div>
                  <div className="defense-roll__dice defense-roll__dice--summary">
                    <span className="defense-roll__die defense-roll__die--summary">
                      C {actionFlow?.remaining?.defender?.crit ?? 0}
                    </span>
                    <span className="defense-roll__die defense-roll__die--summary">
                      H {actionFlow?.remaining?.defender?.norm ?? 0}
                    </span>
                  </div>
                </div>

                <div className="defense-roll__section">
                  <div className="defense-roll__label">Resolve Action</div>
                  <div className="defense-roll__dice defense-roll__dice--summary">
                    <button
                      className="kt-modal__btn kt-modal__btn--primary"
                      type="button"
                      disabled={actionFlow?.resolve?.turn !== "attacker" || (actionFlow?.remaining?.attacker?.norm ?? 0) <= 0}
                      onClick={() => {
                        dispatchIntent({
                          type: "FLOW_RESOLVE_ACTION",
                          payload: {
                            actorRole: "attacker",
                            actionType: "strike",
                            dieType: "norm",
                          },
                        });
                      }}
                    >
                      Attacker Strike (norm)
                    </button>
                    <button
                      className="kt-modal__btn kt-modal__btn--primary"
                      type="button"
                      disabled={actionFlow?.resolve?.turn !== "attacker" || (actionFlow?.remaining?.attacker?.crit ?? 0) <= 0}
                      onClick={() => {
                        dispatchIntent({
                          type: "FLOW_RESOLVE_ACTION",
                          payload: {
                            actorRole: "attacker",
                            actionType: "strike",
                            dieType: "crit",
                          },
                        });
                      }}
                    >
                      Attacker Strike (crit)
                    </button>
                    <button
                      className="kt-modal__btn"
                      type="button"
                      disabled={actionFlow?.resolve?.turn !== "attacker" || (actionFlow?.remaining?.attacker?.norm ?? 0) <= 0 || (actionFlow?.remaining?.defender?.norm ?? 0) <= 0}
                      onClick={() => {
                        dispatchIntent({
                          type: "FLOW_RESOLVE_ACTION",
                          payload: {
                            actorRole: "attacker",
                            actionType: "block",
                            dieType: "norm",
                            blockedType: "norm",
                          },
                        });
                      }}
                    >
                      Attacker Block (norm)
                    </button>
                    <button
                      className="kt-modal__btn"
                      type="button"
                      disabled={actionFlow?.resolve?.turn !== "attacker" || (actionFlow?.remaining?.attacker?.crit ?? 0) <= 0 || ((actionFlow?.remaining?.defender?.crit ?? 0) + (actionFlow?.remaining?.defender?.norm ?? 0)) <= 0}
                      onClick={() => {
                        dispatchIntent({
                          type: "FLOW_RESOLVE_ACTION",
                          payload: {
                            actorRole: "attacker",
                            actionType: "block",
                            dieType: "crit",
                            blockedType: "crit",
                          },
                        });
                      }}
                    >
                      Attacker Block (crit→crit)
                    </button>
                    <button
                      className="kt-modal__btn"
                      type="button"
                      disabled={actionFlow?.resolve?.turn !== "attacker" || (actionFlow?.remaining?.attacker?.crit ?? 0) <= 0 || (actionFlow?.remaining?.defender?.norm ?? 0) <= 0}
                      onClick={() => {
                        dispatchIntent({
                          type: "FLOW_RESOLVE_ACTION",
                          payload: {
                            actorRole: "attacker",
                            actionType: "block",
                            dieType: "crit",
                            blockedType: "norm",
                          },
                        });
                      }}
                    >
                      Attacker Block (crit→norm)
                    </button>
                  </div>
                </div>

                <div className="defense-roll__section">
                  <div className="defense-roll__label">Resolve Action (Defender)</div>
                  <div className="defense-roll__dice defense-roll__dice--summary">
                    <button
                      className="kt-modal__btn kt-modal__btn--primary"
                      type="button"
                      disabled={actionFlow?.resolve?.turn !== "defender" || (actionFlow?.remaining?.defender?.norm ?? 0) <= 0}
                      onClick={() => {
                        dispatchIntent({
                          type: "FLOW_RESOLVE_ACTION",
                          payload: {
                            actorRole: "defender",
                            actionType: "strike",
                            dieType: "norm",
                          },
                        });
                      }}
                    >
                      Defender Strike (norm)
                    </button>
                    <button
                      className="kt-modal__btn kt-modal__btn--primary"
                      type="button"
                      disabled={actionFlow?.resolve?.turn !== "defender" || (actionFlow?.remaining?.defender?.crit ?? 0) <= 0}
                      onClick={() => {
                        dispatchIntent({
                          type: "FLOW_RESOLVE_ACTION",
                          payload: {
                            actorRole: "defender",
                            actionType: "strike",
                            dieType: "crit",
                          },
                        });
                      }}
                    >
                      Defender Strike (crit)
                    </button>
                    <button
                      className="kt-modal__btn"
                      type="button"
                      disabled={actionFlow?.resolve?.turn !== "defender" || (actionFlow?.remaining?.defender?.norm ?? 0) <= 0 || (actionFlow?.remaining?.attacker?.norm ?? 0) <= 0}
                      onClick={() => {
                        dispatchIntent({
                          type: "FLOW_RESOLVE_ACTION",
                          payload: {
                            actorRole: "defender",
                            actionType: "block",
                            dieType: "norm",
                            blockedType: "norm",
                          },
                        });
                      }}
                    >
                      Defender Block (norm)
                    </button>
                    <button
                      className="kt-modal__btn"
                      type="button"
                      disabled={actionFlow?.resolve?.turn !== "defender" || (actionFlow?.remaining?.defender?.crit ?? 0) <= 0 || ((actionFlow?.remaining?.attacker?.crit ?? 0) + (actionFlow?.remaining?.attacker?.norm ?? 0)) <= 0}
                      onClick={() => {
                        dispatchIntent({
                          type: "FLOW_RESOLVE_ACTION",
                          payload: {
                            actorRole: "defender",
                            actionType: "block",
                            dieType: "crit",
                            blockedType: "crit",
                          },
                        });
                      }}
                    >
                      Defender Block (crit→crit)
                    </button>
                    <button
                      className="kt-modal__btn"
                      type="button"
                      disabled={actionFlow?.resolve?.turn !== "defender" || (actionFlow?.remaining?.defender?.crit ?? 0) <= 0 || (actionFlow?.remaining?.attacker?.norm ?? 0) <= 0}
                      onClick={() => {
                        dispatchIntent({
                          type: "FLOW_RESOLVE_ACTION",
                          payload: {
                            actorRole: "defender",
                            actionType: "block",
                            dieType: "crit",
                            blockedType: "norm",
                          },
                        });
                      }}
                    >
                      Defender Block (crit→norm)
                    </button>
                  </div>
                </div>
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
          logRollSequence({
            attackBefore: roll,
            defenseDice: [],
            ceaseless: null,
          });
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

            dispatchIntent({
              type: "APPLY_DAMAGE",
              payload: { targetUnitId: defenderUnit.id, damage: dmg },
            });

            sendMultiplayerEvent("DAMAGE_APPLIED", {
              targetUnitId: defenderUnit.id,
              damage: dmg,
            });

            logEntry({
              type: "DEVASTATING_APPLIED",
              summary: `DEVASTATING: ${defenderUnit?.name || "Defender"} took ${dmg} dmg (${safeOldHealth} -> ${newHealth})`,
              meta: {
                attackerId: attackingOperative?.id,
                defenderId: defenderUnit?.id,
                weaponName: selectedWeapon?.name,
                damage: dmg,
                woundsBefore: safeOldHealth,
                woundsAfter: newHealth,
                ruleLog: payload?.log ?? [],
              },
            });
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
          logRollSequence({ attackBefore, defenseDice, ceaseless });
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
              dispatchIntent({
                type: "APPLY_DAMAGE",
                payload: { targetUnitId: defenderUnit.id, damage: totalDamage },
              });
              sendMultiplayerEvent("DAMAGE_APPLIED", {
                targetUnitId: defenderUnit.id,
                damage: totalDamage,
              });
            }

            logEntry({
              type: "ATTACK_RESOLVED",
              summary: `${attackerUnit?.name || "Attacker"}: ${weapon?.name || "Weapon"} vs ${defenderUnit?.name || "defender"} — dmg ${totalDamage}`,
              meta: {
                attackerId: attackerUnit?.id,
                defenderId: defenderUnit?.id,
                weaponName: weapon?.name,
                remainingHits,
                remainingCrits,
                damage: totalDamage,
              },
            });

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

          if (!autoLogged) {
            logRollSequence({
              attackBefore: ceaseless?.before ?? attackDice,
              defenseDice,
              ceaseless,
            });
          }

          setAllocationModalOpen(true);
        }}
      />

      <DefenseRollModal
        open={defenseModalOpen}
        stage={combatState?.stage}
        attacker={attackingOperative}
        defender={defendingOperative}
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
          logDefenseRoll(roll);
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
            dispatchIntent({
              type: "APPLY_DAMAGE",
              payload: { targetUnitId: defender.id, damage: totalDamage },
            });
            sendMultiplayerEvent("DAMAGE_APPLIED", {
              targetUnitId: defender.id,
              damage: totalDamage,
            });
          }

          logEntry({
            type: "ATTACK_RESOLVED",
            summary: `${attacker?.name || "Attacker"}: ${weapon?.name || "Weapon"} vs ${defender?.name || "defender"} — hits ${hits}, crits ${crits}, saves ${savesUsed}, dmg ${totalDamage}`,
            meta: {
              attackerId: attacker?.id,
              defenderId: defender?.id,
              weaponName: weapon?.name,
              hits,
              crits,
              defenseHits,
              defenseCrits,
              remainingHits,
              remainingCrits,
              damage: totalDamage,
            },
          });

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
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/multiplayer" element={<MultiplayerLobby />} />
      <Route path="/:username/army-selector" element={<ArmySelector />} />
      <Route path="/:username/unit-selector" element={<UnitSelector />} />
      <Route path="/:username/army" element={<ArmyOverlayRoute />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default App;
