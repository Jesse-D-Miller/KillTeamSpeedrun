const normalizeGame = (game) => {
  if (Array.isArray(game)) return { game };
  return game || { game: [] };
};

const getOperatives = (game) => {
  const normalized = normalizeGame(game);
  return Array.isArray(normalized.game) ? normalized.game : [];
};

const isAlive = (op) => Number(op?.state?.woundsCurrent ?? 0) > 0;

export const getReadyOperatives = (game, playerId) =>
  getOperatives(game).filter(
    (op) =>
      op?.owner === playerId &&
      op?.state?.readyState === "READY" &&
      isAlive(op),
  );

export const getExpendedEngageOperatives = (game, playerId) =>
  getOperatives(game).filter(
    (op) =>
      op?.owner === playerId &&
      op?.state?.readyState === "EXPENDED" &&
      op?.state?.order === "engage" &&
      !op?.state?.hasCounteractedThisTP &&
      isAlive(op),
  );

export const getCounteractCandidates = (game, playerId) =>
  getOperatives(game).filter(
    (op) =>
      op?.owner === playerId &&
      op?.state?.readyState === "EXPENDED" &&
      op?.state?.order === "engage" &&
      op?.state?.hasCounteractedThisTP !== true &&
      isAlive(op),
  );

export const hasAnyReady = (game) =>
  getOperatives(game).some(
    (op) => op?.state?.readyState === "READY" && isAlive(op),
  );

export const allOperativesExpended = (game) => {
  const operatives = getOperatives(game).filter(isAlive);
  if (operatives.length === 0) return true;
  return operatives.every((op) => op?.state?.readyState === "EXPENDED");
};

export const nextActivePlayer = (game) => {
  const normalized = normalizeGame(game);
  const current = normalized.firefight?.activePlayerId || null;
  const initiative = normalized.initiativePlayerId || null;
  const readyA = getReadyOperatives(normalized, "A").length;
  const readyB = getReadyOperatives(normalized, "B").length;

  if (!current) {
    if (initiative === "A" && readyA > 0) return "A";
    if (initiative === "B" && readyB > 0) return "B";
    if (readyA > 0) return "A";
    if (readyB > 0) return "B";
    return null;
  }

  const other = current === "A" ? "B" : "A";
  const otherReady = other === "A" ? readyA : readyB;
  const currentReady = current === "A" ? readyA : readyB;

  if (otherReady > 0) return other;
  if (currentReady > 0) return current;
  return null;
};

export const canCounteract = (game, playerId) =>
  getReadyOperatives(game, playerId).length === 0 &&
  getExpendedEngageOperatives(game, playerId).length > 0;

export const isInCounteractWindow = (game, playerId) =>
  game?.phase === "FIREFIGHT" &&
  game?.firefight?.activePlayerId === playerId &&
  !game?.firefight?.activeOperativeId &&
  getReadyOperatives(game, playerId).length === 0 &&
  getCounteractCandidates(game, playerId).length > 0;
