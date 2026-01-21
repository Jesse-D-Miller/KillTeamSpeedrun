export async function createGame() {
  const res = await fetch("/api/games", { method: "POST" });
  if (!res.ok) throw new Error("Failed to create game");
  return res.json();
}

export async function joinGame({ code, slot, playerId, name }) {
  const res = await fetch(`/api/games/${code}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slot, playerId, name }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "Join failed");
  return data;
}

export function connectWS({ code, playerId, onMessage }) {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(
    `${proto}://${location.host}/ws?code=${code}&playerId=${playerId}`,
  );

  ws.addEventListener("message", (e) => {
    try {
      onMessage(JSON.parse(e.data));
    } catch {}
  });

  return ws;
}
