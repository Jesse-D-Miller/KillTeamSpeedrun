import express from "express";
import { WebSocketServer } from "ws";

const app = express();
const PORT = process.env.PORT || 5174;

app.use(express.json());

const games = new Map();

const CODE_LENGTH = 4;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const generateCode = () => {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
};

const createGame = () => {
  let code = generateCode();
  while (games.has(code)) {
    code = generateCode();
  }
  const game = {
    code,
    players: { A: null, B: null },
    state: null,
    eventLog: [],
    seq: 0,
    createdAt: new Date().toISOString(),
  };
  games.set(code, game);
  return game;
};

app.post("/api/games", (req, res) => {
  const game = createGame();
  res.status(201).json({ code: game.code });
});

app.post("/api/games/:code/join", (req, res) => {
  const { code } = req.params;
  const game = games.get(code);

  if (!game) {
    res.status(404).json({ error: "GAME_NOT_FOUND" });
    return;
  }

  const { slot, playerId, name } = req.body || {};
  if (!slot || (slot !== "A" && slot !== "B")) {
    res.status(400).json({ error: "INVALID_SLOT" });
    return;
  }
  if (!playerId || !name) {
    res.status(400).json({ error: "INVALID_PLAYER" });
    return;
  }

  const current = game.players[slot];
  if (!current) {
    game.players[slot] = { playerId, name };
    broadcastToGame(code, {
      type: "SNAPSHOT",
      code,
      players: game.players,
      state: game.state,
      eventLog: game.eventLog,
    });
    res.json({ code: game.code, slot, players: game.players });
    return;
  }

  if (current.playerId === playerId) {
    game.players[slot] = { playerId, name };
    broadcastToGame(code, {
      type: "SNAPSHOT",
      code,
      players: game.players,
      state: game.state,
      eventLog: game.eventLog,
    });
    res.json({ code: game.code, slot, players: game.players, reconnect: true });
    return;
  }

  res.status(409).json({ error: "SLOT_TAKEN" });
});

const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

const wss = new WebSocketServer({ noServer: true });
const socketsByGame = new Map();

const getRoomSockets = (code) => {
  if (!socketsByGame.has(code)) {
    socketsByGame.set(code, new Set());
  }
  return socketsByGame.get(code);
};

const broadcastToGame = (code, payload) => {
  const sockets = socketsByGame.get(code);
  if (!sockets) return;
  const message = JSON.stringify(payload);
  sockets.forEach((socket) => {
    if (socket.readyState === socket.OPEN) {
      socket.send(message);
    }
  });
};

server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url || "", `http://${request.headers.host}`);
  if (url.pathname !== "/ws") {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, url);
  });
});

wss.on("connection", (ws, url) => {
  const code = url.searchParams.get("code") || "";
  const playerId = url.searchParams.get("playerId") || "";
  const game = games.get(code);

  if (!game || !playerId) {
    ws.close(1008, "Invalid game or player");
    return;
  }

  const room = getRoomSockets(code);
  room.add(ws);

  ws.send(
    JSON.stringify({
      type: "SNAPSHOT",
      code,
      players: game.players,
      state: game.state,
      eventLog: game.eventLog,
    }),
  );

  ws.on("message", (raw) => {
    try {
      const message = JSON.parse(raw.toString());
      if (message?.type === "EVENT" && message?.event) {
        if (message.code && message.code !== code) return;
        const slot = message.slot || message.event?.slot;
        if (slot !== "A" && slot !== "B") return;
        const slotPlayer = game.players[slot];
        if (!slotPlayer || slotPlayer.playerId !== playerId) {
          ws.send(JSON.stringify({ type: "ERROR", error: "SLOT_MISMATCH" }));
          return;
        }

        const event = {
          ...message.event,
          slot,
          code,
          seq: game.seq + 1,
          serverTs: Date.now(),
        };

        game.seq += 1;
        game.eventLog.push(event);
        broadcastToGame(code, { type: "EVENT", code, event });
      }
    } catch (err) {
      ws.send(JSON.stringify({ type: "ERROR", error: "INVALID_MESSAGE" }));
    }
  });

  ws.on("close", () => {
    room.delete(ws);
  });
});
