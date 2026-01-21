export function getOrCreatePlayerId() {
  const key = "kt_playerId";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

export function getSavedName() {
  return localStorage.getItem("kt_playerName") || "";
}

export function saveName(name) {
  localStorage.setItem("kt_playerName", name);
}
