import "./App.css";
import UnitCard from "./ui/components/UnitCard";
import UnitListNav from "./ui/components/UnitListNav";
import LogsWindow from "./ui/components/LogsWindow";
import ShootActionCard from "./ui/components/ShootActionCard";
import TargetSelectModal from "./ui/components/TargetSelectModal";
import DiceInputModal from "./ui/components/DiceInputModal";
import DefenseAllocationModal from "./ui/components/DefenseAllocationModal";
import Login from "./ui/screens/Login";
import ArmySelector from "./ui/screens/ArmySelector";
import UnitSelector from "./ui/screens/UnitSelector";
import MultiplayerLobby from "./ui/screens/MultiplayerLobby";
import { gameReducer } from "./state/gameReducer";
import { createLogEntry } from "./state/actionCreator";
import { resolveAttack } from "./engine/rules/resolveAttack";
import { useEffect, useReducer, useRef, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { connectWS } from "./lib/multiplayer";
import { getOrCreatePlayerId } from "./lib/playerIdentity";

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
  });
  const socketRef = useRef(null);
  const seenLogIdsRef = useRef(new Set());
  const seenDamageIdsRef = useRef(new Set());
  const [attackerId, setAttackerId] = useState(null);
  const [defenderId, setDefenderId] = useState(null);
  const [leftTab, setLeftTab] = useState("units");
  const [shootModalOpen, setShootModalOpen] = useState(false);
  const [selectedTargetId, setSelectedTargetId] = useState(null);
  const [diceModalOpen, setDiceModalOpen] = useState(false);
  const [allocationModalOpen, setAllocationModalOpen] = useState(false);
  const [pendingAttack, setPendingAttack] = useState(null);

  const logEntry = ({ type, summary, meta }) => {
    const entry = createLogEntry({
      type,
      summary,
      meta,
      undo: state.game,
      redo: state.game,
    });
    dispatch({ type: "LOG_PUSH", payload: entry });
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
  const canShoot = selectedWeapon?.mode === "ranged";

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
          });
          return;
        }
        if (message.type === "EVENT" && message.event) {
          applyRemoteLogEvent(message.event);
          applyRemoteDamageEvent(message.event);
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
              onUndo={() => dispatch({ type: "UNDO" })}
              onRedo={() => dispatch({ type: "REDO" })}
            />
          )}
        </aside>

        <main className="kt-detail">
          {selectedUnit ? (
            <>
              <UnitCard
                key={selectedUnit.id}
                unit={selectedUnit}
                dispatch={dispatch}
                onLog={logEntry}
              />
              <ShootActionCard
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
          setShootModalOpen(false);
          setDiceModalOpen(true);
        }}
      />

      <DiceInputModal
        open={diceModalOpen}
        attacker={attacker}
        defender={defender}
        attackDiceCount={selectedWeapon?.atk ?? 0}
        defenseDiceCount={3}
        onClose={() => setDiceModalOpen(false)}
        onConfirm={({ attackDice, defenseDice }) => {
          setPendingAttack({
            attacker,
            defender,
            weapon: selectedWeapon,
            attackDice,
            defenseDice,
          });
          setDiceModalOpen(false);
          setAllocationModalOpen(true);
        }}
      />

      <DefenseAllocationModal
        open={allocationModalOpen}
        attacker={pendingAttack?.attacker}
        defender={pendingAttack?.defender}
        weapon={pendingAttack?.weapon}
        attackDice={pendingAttack?.attackDice ?? []}
        defenseDice={pendingAttack?.defenseDice ?? []}
        hitThreshold={pendingAttack?.weapon?.hit ?? 6}
        saveThreshold={pendingAttack?.defender?.stats?.save ?? 6}
        onClose={() => {
          setAllocationModalOpen(false);
          setPendingAttack(null);
        }}
        onConfirm={({ remainingHits, remainingCrits, defenseEntries, attackEntries }) => {
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
            dispatch({
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
      weapons: unit.weapons?.map((weapon) => ({ ...weapon })) ?? [],
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
