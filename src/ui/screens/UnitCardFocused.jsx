import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import "./UnitCardFocused.css";
import "./UnitActionPage.css";
import UnitCard from "../components/UnitCard";
import TopBar from "../components/TopBar";
import LogNotice from "../components/LogNotice";
import Actions from "../components/Actions";
import FirefightPloys from "../components/FirefightPloys";
import OperativeSidebar from "../components/OperativeSidebar";
import { ACTION_CONFIG } from "../../engine/rules/actionsCore";
import {
  canCounteract,
  getCounteractCandidates,
  getReadyOperatives,
  isInCounteractWindow,
} from "../../state/gameLoopSelectors";

function UnitCardFocused() {
  const navigate = useNavigate();
  const location = useLocation();
  const { username, unitId } = useParams();
  const params = new URLSearchParams(location.search);
  const unit = location.state?.unit || null;
  const slot = location.state?.slot || params.get("slot") || "A";
  const gameCode = location.state?.gameCode || params.get("gameCode") || "E2E";
  const topBar = location.state?.topBar || {};
  const latestLogSummary = location.state?.latestLogSummary || "";
  const storedArmyKeyA =
    gameCode && typeof window !== "undefined"
      ? localStorage.getItem(`kt_game_${gameCode}_army_A`)
      : null;
  const storedArmyKeyB =
    gameCode && typeof window !== "undefined"
      ? localStorage.getItem(`kt_game_${gameCode}_army_B`)
      : null;
  const fallbackArmyKey = location.state?.armyKey || params.get("armyKey") || null;
  const armyKeyForSlot =
    slot === "A"
      ? location.state?.armyKeyA || fallbackArmyKey || storedArmyKeyA
      : slot === "B"
        ? location.state?.armyKeyB || fallbackArmyKey || storedArmyKeyB
        : fallbackArmyKey || storedArmyKeyA || storedArmyKeyB;
  const [gameState, setGameState] = useState(() =>
    typeof window !== "undefined" && typeof window.ktGetGameState === "function"
      ? window.ktGetGameState()
      : null,
  );

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (typeof window.ktSubscribeGameState === "function") {
      const unsubscribe = window.ktSubscribeGameState((nextState) => {
        setGameState(nextState);
      });
      return () => unsubscribe?.();
    }
    const handleState = (event) => {
      setGameState(event.detail?.state || null);
    };
    window.addEventListener("kt:state", handleState);
    return () => window.removeEventListener("kt:state", handleState);
  }, []);

  const backTarget = `/${username}/army`;
  const backState = {
    ...(slot ? { slot } : {}),
    ...(gameCode ? { gameCode } : {}),
  };

  const dispatchGameEvent = (type, payload = {}) => {
    console.log("[KT DEBUG] dispatchGameEvent", {
      type,
      payload,
      activePlayerId: gameState?.firefight?.activePlayerId ?? null,
      activeOperativeId: gameState?.firefight?.activeOperativeId ?? null,
    });
    if (typeof window !== "undefined" && typeof window.ktDispatchGameEvent === "function") {
      window.ktDispatchGameEvent(type, payload);
    }
  };

  const effectivePhase = gameState?.phase ?? topBar.phase ?? "SETUP";
  const effectiveTurningPoint = gameState?.turningPoint ?? topBar.turningPoint ?? 0;
  const effectiveInitiativePlayerId =
    gameState?.topBar?.initiativePlayerId ?? topBar.initiativePlayerId ?? null;
  const effectiveCp =
    slot === "B"
      ? gameState?.cp?.B ?? topBar.cp ?? 0
      : gameState?.cp?.A ?? topBar.cp ?? 0;
  const effectiveVp = topBar.vp ?? 0;

  const selectedUnit = useMemo(() => {
    const targetId = unitId || unit?.id || null;
    if (!targetId) return unit;
    const nextUnit = gameState?.game?.find((entry) => entry.id === targetId);
    return nextUnit || unit;
  }, [unitId, unit, gameState]);
  const isFirefightPhase = gameState?.phase === "FIREFIGHT";
  const isMyTurn = gameState?.firefight?.activePlayerId === slot;
  const isOwnedByMe = selectedUnit?.owner === slot;
  const readyOperatives = gameState
    ? getReadyOperatives(gameState, slot)
    : [];
  const hasReadyOperatives = readyOperatives.length > 0;
  const counteractOperatives = gameState
    ? getCounteractCandidates(gameState, slot)
    : [];
  const canCounteractNow = gameState ? canCounteract(gameState, slot) : false;
  const activeOperativeId = gameState?.firefight?.activeOperativeId ?? null;
  const isThisOperativeActive =
    isFirefightPhase && activeOperativeId === selectedUnit?.id;
  const noOperativeActive = !activeOperativeId;
  const hasActiveOperative = Boolean(activeOperativeId);
  const isActiveOperative = Boolean(selectedUnit?.id) && activeOperativeId === selectedUnit?.id;
  const shouldShowActivationButtons =
    Boolean(selectedUnit) &&
    isFirefightPhase &&
    isMyTurn &&
    isOwnedByMe &&
    noOperativeActive &&
    selectedUnit?.state?.readyState === "READY";

  const shouldShowActions =
    Boolean(selectedUnit) &&
    isFirefightPhase &&
    isMyTurn &&
    isOwnedByMe &&
    isThisOperativeActive;
  const canUseFirefightPloys = isFirefightPhase && isMyTurn;
  const showTurnGlow =
    (gameState?.phase === "FIREFIGHT" && isMyTurn) ||
    (gameState?.phase === "STRATEGY" && gameState?.strategy?.turn === slot);

  const awaitingOrder =
    isThisOperativeActive && gameState?.firefight?.awaitingOrder === true;
  const awaitingActions =
    isThisOperativeActive && gameState?.firefight?.awaitingActions === true;
  const canUseActions = awaitingActions;
  const showActionButtons = isThisOperativeActive;
  const isCounteractActive =
    isFirefightPhase &&
    gameState?.firefight?.activation?.isCounteract === true &&
    activeOperativeId === selectedUnit?.id;
  const counteractActionsTaken =
    gameState?.firefight?.activation?.actionsTaken?.length ?? 0;
  const counteractAllowedActions = isCounteractActive
    ? Object.entries(ACTION_CONFIG)
        .filter(([, config]) => Number(config?.cost ?? 0) <= 1)
        .map(([key]) => key)
    : null;
  const inCounteractWindow = gameState
    ? isInCounteractWindow(gameState, slot)
    : false;
  const showCounteract = inCounteractWindow;
  const statusMessage =
    awaitingOrder
      ? "Choose order"
      : isCounteractActive
        ? "Counteract: take 1 free action"
        : inCounteractWindow
          ? ""
          : isFirefightPhase &&
              isMyTurn &&
              !hasReadyOperatives &&
              !canCounteractNow
            ? "No ready operatives"
            : null;

  const reducerPreflight = {
    phase: gameState?.phase ?? null,
    isFirefightPhase,
    slot,
    activePlayerId: gameState?.firefight?.activePlayerId ?? null,
    activeOperativeId: gameState?.firefight?.activeOperativeId ?? null,
    selectedUnitId: selectedUnit?.id ?? null,
    selectedOwner: selectedUnit?.owner ?? null,
    readyState: selectedUnit?.state?.readyState ?? null,
    inGameState: Boolean(gameState?.game?.some((u) => u.id === selectedUnit?.id)),
  };

  const handleActionUse = (actionKey) => {
    if (!selectedUnit?.id) return;
    dispatchGameEvent("ACTION_USE", {
      operativeId: selectedUnit.id,
      actionKey,
    });
  };

  const handleEndActivation = () => {
    dispatchGameEvent("END_ACTIVATION");
    navigate(backTarget, {
      state: backState,
    });
  };

  const handleCounteract = (operativeId) => {
    if (!operativeId) return;
    dispatchGameEvent("COUNTERACT", {
      playerId: slot,
      operativeId,
    });
  };

  const actionAvailability = useMemo(() => {
    if (!selectedUnit) return null;
    const weapons = Array.isArray(selectedUnit.weapons)
      ? selectedUnit.weapons
      : [];
    const order = String(selectedUnit?.state?.order || "").toLowerCase();
    const requiresSilent = order === "conceal";
    const aplCurrentRaw =
      selectedUnit?.state?.activation?.aplCurrent ??
      selectedUnit?.state?.apCurrent ??
      selectedUnit?.state?.aplCurrent ??
      selectedUnit?.stats?.apl ??
      0;
    const aplCurrent = Number(aplCurrentRaw) || 0;

    const hasRule = (weapon, ruleId) => {
      const raw = weapon?.wr ?? weapon?.rules ?? [];
      const list = Array.isArray(raw) ? raw : [raw];
      return list.some((entry) => {
        if (!entry) return false;
        if (typeof entry === "string") {
          return entry.trim().toLowerCase().startsWith(ruleId);
        }
        return String(entry?.id || "").toLowerCase() === ruleId;
      });
    };

    const hasWeaponOfMode = (mode) => {
      const filtered = weapons.filter(
        (weapon) => String(weapon?.mode || "").toLowerCase() === mode,
      );
      if (!requiresSilent) return filtered.length > 0;
      return filtered.some((weapon) => hasRule(weapon, "silent"));
    };

    const rangedAvailable = hasWeaponOfMode("ranged");
    const meleeAvailable = hasWeaponOfMode("melee");

    const availability = Object.keys(ACTION_CONFIG).reduce((acc, key) => {
      const cost = Number(ACTION_CONFIG[key]?.cost ?? 0);
      acc[key] = aplCurrent >= cost;
      return acc;
    }, {});

    availability.shoot = availability.shoot && rangedAvailable;
    availability.fight = availability.fight && meleeAvailable;
    availability.charge = availability.charge && meleeAvailable;

    return availability;
  }, [selectedUnit]);

  if (!selectedUnit) {
    return (
      <div className="unit-card-focused" data-testid="unit-focused">
        <div className="unit-card-focused__panel">
          <div className="unit-card-focused__empty">No unit selected.</div>
          <button
            className="unit-card-focused__back"
            type="button"
            onClick={() =>
              navigate(username ? backTarget : "/", {
                state: backState,
              })
            }
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`unit-card-focused ${showTurnGlow ? "kt-shell--turn-glow" : ""}`}
      data-testid="unit-focused"
    >
      <div className="unit-card-focused__panel">
        <div className="unit-card-focused__header">
          <TopBar
            cp={effectiveCp}
            vp={effectiveVp}
            turningPoint={effectiveTurningPoint}
            phase={effectivePhase}
            initiativePlayerId={effectiveInitiativePlayerId}
          />
          <div className="unit-card-focused__log-row">
            <LogNotice summary={latestLogSummary} />
            <div className="unit-card-focused__actions">
              <button
                className="unit-card-focused__back"
                type="button"
                onClick={() =>
                  navigate(backTarget, {
                    state: backState,
                  })
                }
              >
                Back to army
              </button>
            </div>
          </div>
        </div>
        <div className="unit-card-focused__main">
          <div className="unit-card-focused__card">
            <UnitCard
              unit={selectedUnit}
              dispatch={() => {}}
              canChooseOrder={false}
              activeOperativeId={activeOperativeId}
            />
          </div>
          <aside className="unit-card-focused__sidebar">
            <div className="unit-card-focused__sidebar-title">Operative</div>
            <div className="unit-card-focused__sidebar-body">
              <OperativeSidebar unit={selectedUnit} />
            </div>
          </aside>
        </div>
        <div className="unit-card-focused__activation">
          <div className="unit-card-focused__section-title">Activation</div>
          <div className="unit-card-focused__section-body">
            <div data-testid="actions-panel">
              {shouldShowActivationButtons && (
                <div className="unit-card-focused__activation-buttons">
                  <button
                    className="unit-card-focused__activate"
                    type="button"
                    data-testid="action-activate-conceal"
                    onClick={() => {
                      console.log("[KT DEBUG] Activate preflight", reducerPreflight);
                      dispatchGameEvent("SET_ACTIVE_OPERATIVE", {
                        playerId: slot,
                        operativeId: selectedUnit?.id,
                        order: "conceal",
                      });
                    }}
                  >
                    Activate (Conceal)
                  </button>
                  <button
                    className="unit-card-focused__activate"
                    type="button"
                    data-testid="action-activate-engage"
                    onClick={() => {
                      console.log("[KT DEBUG] Activate preflight", reducerPreflight);
                      dispatchGameEvent("SET_ACTIVE_OPERATIVE", {
                        playerId: slot,
                        operativeId: selectedUnit?.id,
                        order: "engage",
                      });
                    }}
                  >
                    Activate (Engage)
                  </button>
                </div>
              )}
              {(shouldShowActions || inCounteractWindow) && (
                <Actions
                  attacker={selectedUnit}
                  actionMarks={selectedUnit?.state?.actionMarks}
                  onAction={handleActionUse}
                  showActivate={false}
                  onActivateConceal={() =>
                    dispatchGameEvent("SET_ACTIVE_OPERATIVE", {
                      playerId: slot,
                      operativeId: selectedUnit?.id,
                      order: "conceal",
                    })
                  }
                  onActivateEngage={() =>
                    dispatchGameEvent("SET_ACTIVE_OPERATIVE", {
                      playerId: slot,
                      operativeId: selectedUnit?.id,
                      order: "engage",
                    })
                  }
                  showActionButtons={showActionButtons}
                  canUseActions={canUseActions}
                  onEndActivation={handleEndActivation}
                  showCounteract={showCounteract}
                  showCounteractWindow={inCounteractWindow}
                  onCounteract={() =>
                    handleCounteract(
                      selectedUnit?.id ?? counteractOperatives?.[0]?.id,
                    )
                  }
                  onPassCounteract={() =>
                    dispatchGameEvent("PASS_COUNTERACT_WINDOW", {
                      playerId: slot,
                    })
                  }
                  counteractOptions={counteractOperatives}
                  onSelectCounteractOperative={handleCounteract}
                  allowedActions={counteractAllowedActions}
                  actionAvailability={actionAvailability}
                  statusMessage={statusMessage}
                  isCounteractActive={isCounteractActive}
                  counteractActionsTaken={counteractActionsTaken}
                />
              )}
              {!shouldShowActivationButtons &&
                !shouldShowActions &&
                isFirefightPhase &&
                hasActiveOperative &&
                !isThisOperativeActive &&
                "Another operative is currently active."}
              {!shouldShowActivationButtons && !shouldShowActions &&
                "Activation not available"}
            </div>
          </div>
        </div>
        <div className="unit-card-focused__ploys">
          <div className="unit-card-focused__section-title">Firefight ploys</div>
          <div className="unit-card-focused__section-body">
            <FirefightPloys
              armyKey={armyKeyForSlot}
              isVisible={true}
              isEnabled={isFirefightPhase && canUseFirefightPloys}
              cp={effectiveCp}
              onUsePloy={(ploy) => {
                const cost = Number(ploy?.cost?.cp ?? 0);
                dispatchGameEvent("USE_FIREFIGHT_PLOY", {
                  playerId: slot,
                  ployId: ploy?.id || ploy?.name,
                  cost,
                });
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default UnitCardFocused;
