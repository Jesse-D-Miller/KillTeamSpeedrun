import { useEffect, useMemo, useState, useCallback } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
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

  const nextTurningPoint = turningPoint + 1;

  const handleContinue = () => {
    dispatchGameEvent("TURNING_POINT_END", { turningPoint });
    if (!username) return;
    navigate(`/${username}/strategy-phase`, {
      state: {
        ...(location.state || {}),
        slot,
        gameCode,
      },
    });
  };

  return (
    <div className="turning-point-end" data-testid="turning-point-end">
      <button
        className="turning-point-end__card"
        type="button"
        onClick={handleContinue}
      >
        <div className="turning-point-end__title">
          {`End of Turning Point ${turningPoint}`}
        </div>
        <div className="turning-point-end__subtitle">
          {`Start Turning Point ${nextTurningPoint}`}
        </div>
        <div className="turning-point-end__cta">Click to continue</div>
      </button>
    </div>
  );
}

export default TurningPointEnd;
