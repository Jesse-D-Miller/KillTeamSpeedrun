// src/engine/rules/hotResolution.js

export function shouldOpenHotModal(ctx) {
  const effects = ctx?.effects?.attacker || [];
  return effects.some((effect) => effect?.id === "hot" && effect?.detail?.pending);
}
