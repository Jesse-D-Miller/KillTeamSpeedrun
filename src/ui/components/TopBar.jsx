import { useEffect, useMemo, useState } from "react";
import {
  ensureTimerEnd,
  ensureTimerStart,
  formatDuration,
  getTimerElapsedMs,
  getTimerEndMs,
} from "../../lib/gameTimer";

function TopBar({ cp, vp, turningPoint, phase, initiativePlayerId, gameCode }) {
  const [timerLabel, setTimerLabel] = useState("00:00");
  const [timerStopped, setTimerStopped] = useState(false);

  const shouldAutoStartLocal = useMemo(
    () => !gameCode && phase && phase !== "SETUP",
    [gameCode, phase],
  );

  useEffect(() => {
    if (shouldAutoStartLocal) {
      ensureTimerStart(gameCode);
    }
  }, [shouldAutoStartLocal, gameCode]);

  useEffect(() => {
    if (phase !== "GAME_OVER" && phase !== "END_GAME") return;
    ensureTimerEnd(gameCode);
  }, [phase, gameCode]);

  useEffect(() => {
    let intervalId = null;
    const syncTimer = () => {
      const elapsedMs = getTimerElapsedMs(gameCode);
      if (elapsedMs === null) {
        setTimerLabel("00:00");
        setTimerStopped(false);
        return;
      }
      setTimerLabel(formatDuration(elapsedMs));
      setTimerStopped(Boolean(getTimerEndMs(gameCode)));
    };

    syncTimer();
    intervalId = window.setInterval(syncTimer, 1000);

    return () => {
      if (intervalId) {
        window.clearInterval(intervalId);
      }
    };
  }, [gameCode]);

  return (
    <header className="kt-topbar" data-testid="topbar">
      <div className="kt-topbar__item kt-topbar__item--timer">
        <span className="kt-topbar__label">Timer</span>
        <span
          className={`kt-topbar__value kt-topbar__value--timer${
            timerStopped ? " is-stopped" : ""
          }`}
        >
          {timerLabel}
        </span>
      </div>
      <div className="kt-topbar__item">
        <span className="kt-topbar__label">Phase</span>
        <span className="kt-topbar__value">{phase}</span>
      </div>
      <div className="kt-topbar__item">
        <span className="kt-topbar__label">Turning Point</span>
        <span className="kt-topbar__value">{turningPoint}</span>
      </div>
      <div className="kt-topbar__item">
        <span className="kt-topbar__label">Initiative</span>
        <span className="kt-topbar__value">
          {initiativePlayerId ? `Player ${initiativePlayerId}` : "—"}
        </span>
      </div>
      <div className="kt-topbar__item">
        <span className="kt-topbar__label">VP</span>
        <span className="kt-topbar__value">{vp}</span>
      </div>
      <div className="kt-topbar__item">
        <span className="kt-topbar__label">CP</span>
        <span className="kt-topbar__value" data-testid="cp-value">{cp}</span>
      </div>
    </header>
  );
}

export default TopBar;
