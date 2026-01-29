import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import TopBar from "../components/TopBar";
import LogNotice from "../components/LogNotice";
import "./TurningPointEnd.css";

function TurningPointEnd() {
  const navigate = useNavigate();
  const location = useLocation();
  const { username } = useParams();
  const params = new URLSearchParams(location.search);
  const slot = location.state?.slot || params.get("slot") || "A";
  const gameCode = location.state?.gameCode || params.get("gameCode") || "E2E";

  const [gameState, setGameState] = useState(() =>
    typeof window !== "undefined" && typeof window.ktGetGameState === "function"
      ? window.ktGetGameState()
      : null,
  );

  const advanceTimerRef = useRef(null);

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

  const turningPoint = useMemo(() => {
    const raw = gameState?.topBar?.turningPoint ?? gameState?.turningPoint ?? 1;
    return Number(raw) || 1;
  }, [gameState]);

  const initiativePlayerId =
    gameState?.topBar?.initiativePlayerId ??
    gameState?.initiativePlayerId ??
    gameState?.initiative?.winnerPlayerId ??
    null;

  const cpForSlot = slot ? (gameState?.cp?.[slot] ?? 0) : 0;
  const vpForSlot = 0;

  const isSessionPhase = Boolean(gameState?.active?.phase);
  const phaseNow = isSessionPhase
    ? gameState?.active?.phase
    : gameState?.phase;

  const topBar = useMemo(
    () => ({
      cp: cpForSlot,
      vp: vpForSlot,
      turningPoint,
      phase: phaseNow || "STRATEGY",
      initiativePlayerId,
    }),
    [cpForSlot, vpForSlot, turningPoint, phaseNow, initiativePlayerId],
  );

  const logEntries = gameState?.log?.entries || [];
  const logCursor = Number.isFinite(Number(gameState?.log?.cursor))
    ? Number(gameState?.log?.cursor)
    : logEntries.length;
  const latestLogEntry =
    logEntries[logCursor - 1] || logEntries[logEntries.length - 1];
  const latestLogSummary =
    latestLogEntry?.summary || latestLogEntry?.type || "Turning point complete";

  const nextTurningPoint = turningPoint + 1;
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const waitForCondition = useCallback((predicate, timeoutMs = 8000) =>
    new Promise((resolve, reject) => {
      const start = Date.now();
      const tick = () => {
        try {
          if (predicate()) {
            resolve(true);
            return;
          }
        } catch (error) {
          reject(error);
          return;
        }

        if (Date.now() - start >= timeoutMs) {
          reject(new Error("Timed out waiting for game state"));
          return;
        }

        requestAnimationFrame(tick);
      };

      tick();
    }),
  []);

  const handleContinue = async () => {
    if (isAdvancing) return;
    setIsAdvancing(true);
    setElapsedSeconds(0);

    if (advanceTimerRef.current) clearInterval(advanceTimerRef.current);
    advanceTimerRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    if (isSessionPhase) {
      dispatchGameEvent("START_TURN", { turningPoint: nextTurningPoint });
    } else {
      dispatchGameEvent("TURNING_POINT_END", { turningPoint });
    }
    try {
      await waitForCondition(() => {
        const state = window.ktGetGameState?.();
        const phase = state?.active?.phase ?? state?.topBar?.phase ?? state?.phase;
        const tp = Number(
          state?.topBar?.turningPoint ?? state?.turningPoint ?? turningPoint,
        );
        return phase === "STRATEGY" && tp >= nextTurningPoint;
      });
    } finally {
      if (advanceTimerRef.current) {
        clearInterval(advanceTimerRef.current);
        advanceTimerRef.current = null;
      }
      setIsAdvancing(false);
    }

    if (!username) return;
    navigate(`/${username}/strategy-phase`, {
      state: {
        ...(location.state || {}),
        slot,
        gameCode,
      },
    });
  };

  useEffect(() => () => {
    if (advanceTimerRef.current) clearInterval(advanceTimerRef.current);
  }, []);

  return (
    <div className="turning-point-end kt-shell" data-testid="turning-point-end">
      <div className="turning-point-end__panel">
        <div className="turning-point-end__header">
          <TopBar
            cp={topBar.cp ?? 0}
            vp={topBar.vp ?? 0}
            turningPoint={topBar.turningPoint ?? 1}
            phase={topBar.phase ?? "STRATEGY"}
            initiativePlayerId={topBar.initiativePlayerId ?? null}
          />
          <LogNotice summary={latestLogSummary} />
        </div>

        <div className="turning-point-end__content">
          <button
            className="turning-point-end__card"
            type="button"
            onClick={handleContinue}
            disabled={isAdvancing}
          >
            <div className="turning-point-end__title">
              {`End of Turning Point ${turningPoint}`}
            </div>
            <div className="turning-point-end__subtitle">
              {`Start Turning Point ${nextTurningPoint}`}
            </div>
            <div className="turning-point-end__cta">
              {isAdvancing
                ? `Advancing Game To Strategy Phase, TP ${nextTurningPoint} (${elapsedSeconds}s)`
                : "Click to continue"}
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

export default TurningPointEnd;
