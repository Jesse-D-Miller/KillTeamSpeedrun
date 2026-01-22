import "./App.css";
import UnitCard from "./ui/components/UnitCard";
import UnitListNav from "./ui/components/UnitListNav";
import LogsWindow from "./ui/components/LogsWindow";
import Actions from "./ui/components/Actions";
import TopBar from "./ui/components/TopBar";
import TargetSelectModal from "./ui/components/TargetSelectModal";
import DiceInputModal from "./ui/components/DiceInputModal";
import DefenseAllocationModal from "./ui/components/DefenseAllocationModal";
import DefenseRollModal from "./ui/components/DefenseRollModal";
import Login from "./ui/screens/Login";
import ArmySelector from "./ui/screens/ArmySelector";
import UnitSelector from "./ui/screens/UnitSelector";
import MultiplayerLobby from "./ui/screens/MultiplayerLobby";
import { gameReducer, initialCombatState, COMBAT_STAGES } from "./state/gameReducer";
import { createLogEntry } from "./state/actionCreator";
import { resolveAttack } from "./engine/rules/resolveAttack";
import { normalizeWeaponRules } from "./engine/rules/weaponRules";
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
    game: initialUnits,
    log: {
      entries: [],
      cursor: 0,
    },
    combatState: initialCombatState,
  });
  const socketRef = useRef(null);
  const seenLogIdsRef = useRef(new Set());
  const seenDamageIdsRef = useRef(new Set());
  const seenCombatIdsRef = useRef(new Set());
  const [attackerId, setAttackerId] = useState(null);
  const [defenderId, setDefenderId] = useState(null);
  const [leftTab, setLeftTab] = useState("units");
  const [shootModalOpen, setShootModalOpen] = useState(false);
  const [selectedTargetId, setSelectedTargetId] = useState(null);
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
    myTeamUnits.find((u) => u.id === selectedUnitId) ??
    myTeamUnits[0] ??
    null;
  const attackerTeamId = selectedUnit?.teamId || myTeamId;
  const opponentUnits =
    attackerTeamId === "alpha" ? teamBUnits : teamAUnits;

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
  const getAccurateMax = (weapon) => {
    const rules = normalizeWeaponRules(weapon);
    const rule = rules.find((item) => item.id === "accurate");
    const value = Number(rule?.value);
    return Number.isFinite(value) && value > 0 ? value : 0;
  };
  const canShoot = selectedWeapon?.mode === "ranged";
  const cp = 0;
  const vp = 0;
  const turningPoint = 1;
  const phase = "Strategy";

  useEffect(() => {
    if (!selectedUnit && myTeamUnits.length > 0) {
      setSelectedUnitId(myTeamUnits[0].id);
    }
  }, [selectedUnit, myTeamUnits]);

  useEffect(() => {
    if (!shootModalOpen) return;
    if (opponentUnits.length > 0 && !selectedTargetId) {
      setSelectedTargetId(opponentUnits[0].id);
    }
  }, [shootModalOpen, opponentUnits, selectedTargetId]);

  const currentPlayerId = playerSlot || getOrCreatePlayerId();
  const otherPlayerId = playerSlot
    ? playerSlot === "A"
      ? "B"
      : "A"
    : null;
  const combatState = state.combatState;
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
        JSON.stringify({ type: "EVENT", code: gameCode, slot: playerSlot, event }),
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
          });
          return;
        }
        if (message.type === "EVENT" && message.event) {
          applyRemoteLogEvent(message.event);
          applyRemoteDamageEvent(message.event);
          applyRemoteCombatEvent(message.event);
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
                <Actions
                  attacker={selectedUnit}
                  hasTargets={opponentUnits.length > 0 && canShoot}
                  onShoot={() => {
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
                    setAttackerId(selectedUnit.id);
                    setShootModalOpen(true);
                  }}
                />
              </>
            ) : (
              <div className="kt-empty">No units loaded</div>
            )}
          </main>
        </div>
      </div>

      <TargetSelectModal
        open={shootModalOpen}
        attacker={selectedUnit}
        targets={opponentUnits}
        selectedTargetId={selectedTargetId}
        onSelectTarget={setSelectedTargetId}
        onClose={() => setShootModalOpen(false)}
        onConfirm={() => {
          if (!selectedTargetId) return;
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
            defendingOperativeId: selectedTargetId,
            weaponId: selectedWeapon?.name || null,
            weaponProfile: selectedWeapon || null,
          });
          setShootModalOpen(false);
        }}
      />

      <DiceInputModal
        open={attackModalOpen}
        attacker={attacker}
        defender={defender}
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
        onLockAttack={() => {
          dispatchCombatEvent("LOCK_ATTACK_ROLL");
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
            const [normalDmg, critDmg] =
              weapon?.dmg?.split("/").map(Number) ?? [0, 0];
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
            dispatchCombatEvent("CLEAR_COMBAT_STATE");
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
        defenseDice={combatState?.defenseRoll ?? pendingAttack?.defenseDice ?? []}
        hitThreshold={(combatState?.weaponProfile || pendingAttack?.weapon)?.hit ?? 6}
        saveThreshold={(defendingOperative || pendingAttack?.defender)?.stats?.save ?? 6}
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
        onConfirm={({ remainingHits, remainingCrits, defenseEntries, attackEntries }) => {
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
          const [normalDmg, critDmg] =
            weapon?.dmg?.split("/").map(Number) ?? [0, 0];
          const safeNormalDmg = Number.isFinite(normalDmg) ? normalDmg : 0;
          const safeCritDmg = Number.isFinite(critDmg) ? critDmg : 0;
          const totalDamage =
            remainingHits * safeNormalDmg + remainingCrits * safeCritDmg;
          const hits = attackEntries.filter((d) => d.type === "hit").length;
          const crits = attackEntries.filter((d) => d.type === "crit").length;
          const defenseHits = defenseEntries.filter((d) => d.type === "hit").length;
          const defenseCrits = defenseEntries.filter((d) => d.type === "crit").length;
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
              <button
                type="button"
                className="btn"
                onClick={closeIntentGate}
              >
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
    location.state?.selectedUnitIdsA || (slot === "A" ? selectedUnitIds : undefined);
  const selectedUnitIdsB =
    location.state?.selectedUnitIdsB || (slot === "B" ? selectedUnitIds : undefined);

  const teamA = armies.find((army) => army.key === armyKeyA) || armies[0];
  const teamB = armies.find((army) => army.key === armyKeyB) || teamA;

  const filteredUnitsA = Array.isArray(selectedUnitIdsA)
    ? teamA.units.filter((unit) => selectedUnitIdsA.includes(unit.id))
    : teamA.units;

  const filteredUnitsB = Array.isArray(selectedUnitIdsB)
    ? teamB.units.filter((unit) => selectedUnitIdsB.includes(unit.id))
    : teamB.units;

  const buildTeamUnits = (units, teamId) =>
    units.map((unit) => ({
      ...unit,
      id: `${teamId}:${unit.id}`,
      baseId: unit.id,
      teamId,
      stats: { ...unit.stats },
      state: { ...unit.state },
      weapons:
        unit.weapons?.map((weapon) => ({
          ...weapon,
          wr: normalizeWeaponRulesList(weapon.wr),
        })) ?? [],
      rules: unit.rules?.map((rule) => ({ ...rule })) ?? [],
      abilities: unit.abilities?.map((ability) => ({ ...ability })) ?? [],
    }));

  const combinedUnits = [
    ...buildTeamUnits(filteredUnitsA, "alpha"),
    ...buildTeamUnits(filteredUnitsB, "beta"),
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
