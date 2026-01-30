const buildTimerKey = (gameCode, suffix) => {
  const key = gameCode ? String(gameCode) : "local";
  return `kt_game_${key}_timer_${suffix}`;
};

const readTimestamp = (gameCode, suffix) => {
  if (typeof window === "undefined") return null;
  const key = buildTimerKey(gameCode, suffix);
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
};

const writeTimestamp = (gameCode, suffix, value) => {
  if (typeof window === "undefined") return null;
  const key = buildTimerKey(gameCode, suffix);
  window.localStorage.setItem(key, String(value));
  return value;
};

export const getTimerStartMs = (gameCode) => readTimestamp(gameCode, "start");

export const getTimerEndMs = (gameCode) => readTimestamp(gameCode, "end");

export const ensureTimerStart = (gameCode, startMs = Date.now()) => {
  const existing = getTimerStartMs(gameCode);
  if (existing) return existing;
  return writeTimestamp(gameCode, "start", startMs);
};

export const ensureTimerEnd = (gameCode, endMs = Date.now()) => {
  const existing = getTimerEndMs(gameCode);
  if (existing) return existing;
  return writeTimestamp(gameCode, "end", endMs);
};

export const getTimerElapsedMs = (gameCode, nowMs = Date.now()) => {
  const startMs = getTimerStartMs(gameCode);
  if (!startMs) return null;
  const endMs = getTimerEndMs(gameCode);
  const effectiveEnd = endMs || nowMs;
  return Math.max(0, effectiveEnd - startMs);
};

export const formatDuration = (durationMs) => {
  const totalSeconds = Math.max(0, Math.floor(Number(durationMs || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};