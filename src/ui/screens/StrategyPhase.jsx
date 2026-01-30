import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import "./StrategyPhase.css";
import TopBar from "../components/TopBar";
import LogNotice from "../components/LogNotice";
import StrategicPloys from "../components/strategicPloys";

/**
 * Working StrategyPhase stepper + orchestration.
 *
 * Assumptions (match what we discussed):
 * - Shared state is updated via window.ktSubscribeGameState or "kt:state" events
 * - These event types exist in your reducer/engine:
 *    - "READY_ALL_OPERATIVES"   (or swap to your existing ready event)
 *    - "AWARD_COMMAND_POINTS"   (or swap to your existing CP events)
 *    - "SET_INITIATIVE"
 *    - "USE_STRATEGIC_PLOY"
 *    - "PASS_STRATEGIC_PLOY"
 *    - "END_STRATEGY_PHASE"
 *
 * If any of those don’t exist, swap the event name(s) only—everything else stays.
 */

function StrategyPhase() {
  const navigate = useNavigate();
  const location = useLocation();
  const { username } = useParams();

  const navState = location.state || {};
  const params = new URLSearchParams(location.search);
  const slot = navState?.slot || params.get("slot") || "A"; // "A" | "B"
  const gameCode = navState?.gameCode || params.get("gameCode") || "E2E";
  const armyKeyFromQuery = params.get("armyKey") || "kommandos";

  // --- shared state subscription ---
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

    const handleState = (event) => setGameState(event.detail?.state || null);
    window.addEventListener("kt:state", handleState);
    return () => window.removeEventListener("kt:state", handleState);
  }, []);

  const dispatchGameEvent = useCallback((type, payload = {}) => {
    if (typeof window !== "undefined" && typeof window.ktDispatchGameEvent === "function") {
      window.ktDispatchGameEvent(type, payload);
    }
  }, []);

  // --- canonical reads / fallbacks ---
  const topBarInitiative = gameState?.topBar?.initiativePlayerId;
  const initiativePlayerId =
    topBarInitiative !== undefined
      ? topBarInitiative
      : gameState?.initiativePlayerId ??
        gameState?.initiative?.winnerPlayerId ??
        null;

  const turningPoint =
    Number(gameState?.topBar?.turningPoint ?? gameState?.turningPoint ?? 1) || 1;

  const phaseNow = gameState?.topBar?.phase ?? gameState?.phase ?? "STRATEGY";

  const cpForSlot = slot ? (gameState?.cp?.[slot] ?? 0) : 0;

  const topBar = useMemo(
    () => ({
      cp: cpForSlot,
      vp: 0,
      turningPoint,
      phase: phaseNow,
      initiativePlayerId,
    }),
    [cpForSlot, turningPoint, phaseNow, initiativePlayerId],
  );

  // --- logs ---
  const logEntries = gameState?.log?.entries || [];
  const logCursor = Number.isFinite(Number(gameState?.log?.cursor))
    ? Number(gameState?.log?.cursor)
    : logEntries.length;
  const latestLogEntry =
    logEntries[logCursor - 1] || logEntries[logEntries.length - 1];
  const latestLogSummary =
    latestLogEntry?.summary || latestLogEntry?.type || "No log entries yet";

  // --- strategy/ploy state ---
  const activeChooser = gameState?.strategy?.activeChooserPlayerId ?? null;
  const passedByPlayer = gameState?.strategy?.passedByPlayer || {};
  const usedPloyIds = slot ? (gameState?.strategy?.usedPloyIdsByPlayer?.[slot] ?? []) : [];

  const bothPassed = Boolean(passedByPlayer?.A) && Boolean(passedByPlayer?.B);

  const canAct = Boolean(slot && activeChooser === slot);
  const canAdvanceToFirefight = Boolean(initiativePlayerId) && Boolean(bothPassed);

  // --- army key (nav state) ---
  const armyKey = useMemo(() => {
    if (navState.armyKey) return navState.armyKey;
    if (armyKeyFromQuery) return armyKeyFromQuery;
    if (slot === "A") return navState.armyKeyA || navState.armyKeyB || null;
    if (slot === "B") return navState.armyKeyB || navState.armyKeyA || null;
    return navState.armyKeyA || navState.armyKeyB || null;
  }, [navState, slot, location.state, armyKeyFromQuery]);

  // --- READY step: robust operative collector (prevents deadlock) ---
  const collectOperatives = useCallback((state) => {
    if (!state) return [];

    // Common shapes:
    if (Array.isArray(state.operatives)) return state.operatives;
    if (Array.isArray(state.game)) return state.game;

    // teams object: { A: { operatives: [] }, B: { operatives: [] } }
    const teamsObj = state.teams || state.teamsByPlayer;
    if (teamsObj && typeof teamsObj === "object") {
      const maybe = Object.values(teamsObj).flatMap((t) =>
        Array.isArray(t?.operatives) ? t.operatives : [],
      );
      if (maybe.length) return maybe;
    }

    // teams array: [{ operatives: [] }, { operatives: [] }]
    if (Array.isArray(state.teams)) {
      const maybe = state.teams.flatMap((t) =>
        Array.isArray(t?.operatives) ? t.operatives : [],
      );
      if (maybe.length) return maybe;
    }

    return [];
  }, []);

  const isOperativeReady = useCallback((op) => {
    // Adapt to whatever fields you actually use; this is “best effort”
    if (op?.state?.readyState != null) return op.state.readyState === "READY";
    if (op?.state?.ready != null) return op.state.ready === true;
    if (op?.state?.activation?.activatedThisRound != null) {
      return op.state.activation.activatedThisRound === false;
    }
    // If unknown, assume ready (don’t deadlock the UI)
    return true;
  }, []);

  const operativesReadiedThisTP = Boolean(gameState?.strategy?.operativesReadiedThisTP);
  const [readyDispatched, setReadyDispatched] = useState(false);

  const areAllOperativesReadied = useMemo(() => {
    if (operativesReadiedThisTP || readyDispatched) return true;
    const list = collectOperatives(gameState);
    if (!list.length) return false;
    return list.every((op) => isOperativeReady(op));
  }, [collectOperatives, gameState, isOperativeReady, operativesReadiedThisTP, readyDispatched]);

  // --- Stepper model ---
  const STEPS = useMemo(
    () => [
      { id: "READY", label: "Ready operatives", desc: "Readies all operatives." },
      { id: "INIT", label: "Determine initiative", desc: "Tap A/B after rolling." },
      { id: "CP", label: "Generate command points", desc: "Apply CP for this TP." },
      { id: "PLOYS", label: "Select strategic ploys", desc: "Alternate until both pass." },
    ],
    [],
  );

  const [bannerStepIndex, setBannerStepIndex] = useState(0);
  const [bannerStatus, setBannerStatus] = useState("idle"); // "idle" | "running" | "complete"
  const [flashGreen, setFlashGreen] = useState(false);
  const [pendingFirefightNav, setPendingFirefightNav] = useState(false);
  const [readyDispatchTick, setReadyDispatchTick] = useState(0);

  // “freeze” auto snapping when user clicks arrows
  const manualNavRef = useRef({ until: 0 });
  const freezeAuto = useCallback(() => {
    manualNavRef.current.until = Date.now() + 2500;
  }, []);
  const isAutoFrozen = useCallback(() => Date.now() < manualNavRef.current.until, []);

  // step completion conditions
  const cpAwardedForTP = Number(gameState?.strategy?.cpAwardedForTP ?? 0);
  const isCPComplete = cpAwardedForTP === turningPoint;

  const isPloysComplete = Boolean(initiativePlayerId) && (activeChooser === null || bothPassed);

  const derivedStepIndex = useMemo(() => {
    if (!areAllOperativesReadied) return 0;
    if (!initiativePlayerId) return 1;
    if (!isCPComplete) return 2;
    return 3;
  }, [areAllOperativesReadied, initiativePlayerId, isCPComplete]);

  const currentStep = STEPS[bannerStepIndex] || STEPS[0];

  // run-once guards per TP
  const ranRef = useRef({ tp: null, READY: false, CP: false });
  const completionRef = useRef({ tp: null, stepId: null });

  // timers
  const autoAdvanceRef = useRef(null);
  const flashTimerRef = useRef(null);
  const navigateTimerRef = useRef(null);

  const triggerReadyComplete = useCallback(() => {
    if (currentStep?.id !== "READY") return;
    if (completionRef.current.tp === turningPoint && completionRef.current.stepId === "READY") {
      return;
    }

    completionRef.current = { tp: turningPoint, stepId: "READY" };
    setBannerStatus("complete");
    setFlashGreen(true);

    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current);

    flashTimerRef.current = setTimeout(() => setFlashGreen(false), 600);
    autoAdvanceRef.current = setTimeout(() => {
      setBannerStepIndex((prev) => Math.min(prev + 1, STEPS.length - 1));
    }, 1000);
  }, [currentStep?.id, turningPoint, STEPS.length]);

  // reset per TP
  useEffect(() => {
    if (ranRef.current.tp !== turningPoint) {
      ranRef.current = { tp: turningPoint, READY: false, CP: false };
      completionRef.current = { tp: turningPoint, stepId: null };
      setReadyDispatched(false);
      setBannerStepIndex(0);
      setBannerStatus("idle");
      setFlashGreen(false);
    }
  }, [turningPoint]);

  // E2E hook: mark step complete when green flash triggers
  useEffect(() => {
    if (!flashGreen) return;
    if (typeof window === "undefined") return;
    if (!Array.isArray(window.__ktE2E_gameEvents)) return;
    window.__ktE2E_stepperComplete = true;
  }, [flashGreen]);

  // fire READY on initial render of strategy phase
  useEffect(() => {
    if (phaseNow !== "STRATEGY") return;
    if (ranRef.current.READY) return;
    if (typeof window === "undefined" || typeof window.ktDispatchGameEvent !== "function") {
      const retryTimer = setTimeout(
        () => setReadyDispatchTick((prev) => prev + 1),
        50,
      );
      return () => clearTimeout(retryTimer);
    }
    dispatchGameEvent("READY_ALL_OPERATIVES");
    ranRef.current.READY = true;
    setReadyDispatched(true);
    triggerReadyComplete();
  }, [phaseNow, dispatchGameEvent, readyDispatchTick, triggerReadyComplete]);

  // keep step index in sync (unless user is browsing steps)
  useEffect(() => {
    if (isAutoFrozen()) return;
    if (bannerStepIndex < derivedStepIndex) {
      if (currentStep?.id === "READY" && completionRef.current.stepId !== "READY") {
        return;
      }
      setBannerStepIndex(derivedStepIndex);
    }
  }, [bannerStepIndex, derivedStepIndex, isAutoFrozen, currentStep?.id]);

  // main step runner + auto-advance
  useEffect(() => {
    // clear any previous timers on step changes
    if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    autoAdvanceRef.current = null;
    flashTimerRef.current = null;

    const stepId = currentStep?.id;

    const stepIsComplete = (() => {
      switch (stepId) {
        case "READY":
          return areAllOperativesReadied;
        case "INIT":
          return Boolean(initiativePlayerId);
        case "CP":
          return isCPComplete;
        case "PLOYS":
          return isPloysComplete;
        default:
          return false;
      }
    })();

    // If not complete, possibly run step action (READY / CP), then idle/running
    if (!stepIsComplete) {
      if (stepId === "READY" && !ranRef.current.READY) {
        if (typeof window === "undefined" || typeof window.ktDispatchGameEvent !== "function") {
          setBannerStatus("idle");
          return undefined;
        }
        // If your app uses a different event name, swap it here.
        dispatchGameEvent("READY_ALL_OPERATIVES");
        ranRef.current.READY = true;
        setReadyDispatched(true);
        setBannerStatus("running");
        triggerReadyComplete();
      } else if (stepId === "CP" && !ranRef.current.CP && initiativePlayerId) {
        // If your app uses different CP events, swap here.
        const awards =
          turningPoint === 1
            ? { A: 2, B: 2 }
            : initiativePlayerId === "A"
              ? { A: 1, B: 2 }
              : { A: 2, B: 1 };

        dispatchGameEvent("AWARD_COMMAND_POINTS", {
          tp: turningPoint,
          awards,
          reason: "STRATEGY_PHASE",
        });

        ranRef.current.CP = true;
        setBannerStatus("running");
      } else {
        setBannerStatus("idle");
      }

      setFlashGreen(false);
      return undefined;
    }

    // Already complete: avoid re-flashing same step repeatedly
    if (completionRef.current.tp === turningPoint && completionRef.current.stepId === stepId) {
      setBannerStatus("complete");
      return undefined;
    }

    completionRef.current = { tp: turningPoint, stepId };
    setBannerStatus("complete");

    // flash green, then advance after a short delay
    setFlashGreen(true);
    flashTimerRef.current = setTimeout(() => setFlashGreen(false), 600);

    autoAdvanceRef.current = setTimeout(() => {
      if (stepId === "PLOYS") {
        // End strategy and move on automatically
        dispatchGameEvent("END_STRATEGY_PHASE");
        setPendingFirefightNav(true);
        return;
      }
      setBannerStepIndex((prev) => Math.min(prev + 1, STEPS.length - 1));
    }, 1000);

    return () => {
      if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      autoAdvanceRef.current = null;
      flashTimerRef.current = null;
    };
  }, [
    STEPS.length,
    areAllOperativesReadied,
    currentStep?.id,
    dispatchGameEvent,
    initiativePlayerId,
    isCPComplete,
    isPloysComplete,
    turningPoint,
  ]);

  // Auto navigate after phase flips to FIREFIGHT
  useEffect(() => {
    if (!pendingFirefightNav) return;

    const nextPhase = gameState?.topBar?.phase ?? gameState?.phase ?? null;
    if (nextPhase !== "FIREFIGHT") return;

    if (navigateTimerRef.current) clearTimeout(navigateTimerRef.current);
    navigateTimerRef.current = setTimeout(() => {
      setPendingFirefightNav(false);
      navigate(`/${username}/army`, {
        state: {
          ...navState,
          ...(slot ? { slot } : {}),
          ...(gameCode ? { gameCode } : {}),
        },
      });
    }, 1000);

    return () => {
      if (navigateTimerRef.current) clearTimeout(navigateTimerRef.current);
      navigateTimerRef.current = null;
    };
  }, [pendingFirefightNav, gameState, navigate, username, navState, slot, gameCode]);

  // --- UI ---
  return (
    <div className="strategy-phase" data-testid="screen-root">
      <div className="strategy-phase__panel">
        <div className="strategy-phase__header">
          <TopBar
            cp={topBar.cp ?? 0}
            vp={topBar.vp ?? 0}
            turningPoint={topBar.turningPoint ?? 1}
            phase={topBar.phase ?? "STRATEGY"}
            initiativePlayerId={topBar.initiativePlayerId ?? null}
            gameCode={gameCode}
          />
          <LogNotice summary={latestLogSummary || "Awaiting initiative roll"} />
        </div>

        <div className="strategy-phase__content">
          <div className="strategy-phase__title">Strategy Phase</div>

          {/* Step banner */}
          <div className="strategy-phase__stepper">
            <button
              className="strategy-phase__stepper-btn"
              type="button"
              data-testid="strategy-prev-step"
              disabled={bannerStepIndex <= 0}
              onClick={() => {
                freezeAuto();
                setBannerStepIndex((prev) => Math.max(prev - 1, 0));
              }}
              aria-label="Previous step"
            >
              ←
            </button>

            <div
              className={[
                "strategy-phase__stepper-content",
                `strategy-phase__stepper-content--${bannerStatus}`,
                flashGreen ? "is-complete" : "",
              ].join(" ")}
              data-testid="strategy-stepper"
            >
              <div className="strategy-phase__stepper-label">
                Step {bannerStepIndex + 1}/4 — {currentStep?.label}
              </div>
              <div className="strategy-phase__stepper-desc">{currentStep?.desc}</div>
            </div>

            <button
              className="strategy-phase__stepper-btn"
              type="button"
              data-testid="strategy-next-step"
              disabled={bannerStepIndex >= STEPS.length - 1}
              onClick={() => {
                freezeAuto();
                setBannerStepIndex((prev) => Math.min(prev + 1, STEPS.length - 1));
              }}
              aria-label="Next step"
            >
              →
            </button>
          </div>

          <div className="strategy-phase__subtitle">Roll initiative to begin.</div>

          <div className="strategy-phase__initiative" data-testid="strategy-initiative">
            <p className="strategy-phase__hint">Roll in real life, then tap the winner.</p>
            <div className="strategy-phase__initiative-buttons">
              <button
                className="strategy-phase__initiative-btn strategy-phase__initiative-btn--a"
                type="button"
                data-testid="initiative-A"
                onClick={() => dispatchGameEvent("SET_INITIATIVE", { winnerPlayerId: "A" })}
              >
                A
              </button>
              <button
                className="strategy-phase__initiative-btn strategy-phase__initiative-btn--b"
                type="button"
                data-testid="initiative-B"
                onClick={() => dispatchGameEvent("SET_INITIATIVE", { winnerPlayerId: "B" })}
              >
                B
              </button>
            </div>
          </div>

          {/* Ploys UI */}
          {initiativePlayerId && !armyKey && (
            <div
              className="strategy-phase__warning"
              data-testid="strategy-warning-no-armykey"
            >
              No armyKey passed to StrategyPhase
            </div>
          )}

          {initiativePlayerId && armyKey && (
            <div data-testid="strategy-ploys">
              <StrategicPloys
                armyKey={armyKey}
                isVisible
                currentPlayerId={activeChooser}
                localPlayerId={slot}
                isInteractive={canAct}
                activeChooserPlayerId={activeChooser}
                usedPloyIds={usedPloyIds}
                passedByPlayer={passedByPlayer}
                onUsePloy={(ploy) =>
                  dispatchGameEvent("USE_STRATEGIC_PLOY", {
                    playerId: slot,
                    ployId: ploy.id,
                  })
                }
                onPass={() =>
                  dispatchGameEvent("PASS_STRATEGIC_PLOY", {
                    playerId: slot,
                  })
                }
              />
            </div>
          )}
        </div>

        <div className="strategy-phase__footer">
          <button
            className="strategy-phase__firefight"
            type="button"
            data-testid="go-firefight"
            disabled={!canAdvanceToFirefight}
            onClick={() => {
              dispatchGameEvent("END_STRATEGY_PHASE");
              setPendingFirefightNav(true);
            }}
          >
            FIREFIGHT PHASE
          </button>
        </div>
      </div>
    </div>
  );
}

export default StrategyPhase;
