import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./MultiplayerLobby.css";
import { getOrCreatePlayerId, getSavedName, saveName } from "../../lib/playerIdentity";
import { connectWS, createGame, joinGame } from "../../lib/multiplayer";

const eventReducer = (state, action) => {
  switch (action.type) {
    case "APPLY_REMOTE_EVENT": {
      const { event } = action;
      if (!event?.id || state.seenEventIds.has(event.id)) return state;
      const nextSeen = new Set(state.seenEventIds);
      nextSeen.add(event.id);
      return {
        ...state,
        eventLog: [...state.eventLog, event],
        seenEventIds: nextSeen,
      };
    }
    case "SET_EVENT_LOG": {
      const nextSeen = new Set(state.seenEventIds);
      action.eventLog.forEach((event) => {
        if (event?.id) nextSeen.add(event.id);
      });
      return {
        ...state,
        eventLog: action.eventLog,
        seenEventIds: nextSeen,
      };
    }
    case "RESET":
      return { eventLog: [], seenEventIds: new Set() };
    default:
      return state;
  }
};

const buildEventId = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

function MultiplayerLobby() {
  const navigate = useNavigate();
  const initialMe = useMemo(
    () => ({
      playerId: getOrCreatePlayerId(),
      name: getSavedName(),
    }),
    [],
  );

  const [uiState, setUiState] = useState({
    phase: "start",
    gameCode: "",
    slot: null,
    me: initialMe,
    players: { A: null, B: null },
  });
  const [eventState, eventDispatch] = useReducer(eventReducer, {
    eventLog: [],
    seenEventIds: new Set(),
  });
  const [connectionStatus, setConnectionStatus] = useState("disconnected");
  const [error, setError] = useState("");
  const socketRef = useRef(null);
  const [hasNavigated, setHasNavigated] = useState(false);

  const updateName = (name) => {
    saveName(name);
    setUiState((prev) => ({
      ...prev,
      me: {
        ...prev.me,
        name,
      },
    }));
  };

  const handleCreate = async () => {
    setError("");
    try {
      const result = await createGame();
      setUiState((prev) => ({
        ...prev,
        phase: "join",
        gameCode: result.code || "",
        slot: "A",
      }));
    } catch (err) {
      setError(err.message);
    }
  };

  const handleJoin = async () => {
    if (!uiState.gameCode || !uiState.slot || !uiState.me.name.trim()) return;
    setError("");
    try {
      const result = await joinGame({
        code: uiState.gameCode,
        slot: uiState.slot,
        playerId: uiState.me.playerId,
        name: uiState.me.name.trim(),
      });
      setUiState((prev) => ({
        ...prev,
        phase: "inGame",
        players: result.players || prev.players,
      }));
      if (Array.isArray(result.eventLog)) {
        eventDispatch({ type: "SET_EVENT_LOG", eventLog: result.eventLog });
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleReset = () => {
    setUiState((prev) => ({
      ...prev,
      phase: "start",
      gameCode: "",
      slot: null,
      players: { A: null, B: null },
    }));
    eventDispatch({ type: "RESET" });
    setConnectionStatus("disconnected");
    setError("");
  };

  const canJoin = Boolean(
    uiState.gameCode.trim() && uiState.slot && uiState.me.name.trim(),
  );

  useEffect(() => {
    if (uiState.phase !== "inGame" || !uiState.gameCode) return undefined;

    const socket = connectWS({
      code: uiState.gameCode,
      playerId: uiState.me.playerId,
      onMessage: (message) => {
        if (message.type === "SNAPSHOT") {
          if (message.players) {
            setUiState((prev) => ({
              ...prev,
              players: message.players,
            }));
          }
          if (Array.isArray(message.eventLog)) {
            eventDispatch({ type: "SET_EVENT_LOG", eventLog: message.eventLog });
          }
          return;
        }

        if (message.type === "EVENT" && message.event) {
          eventDispatch({ type: "APPLY_REMOTE_EVENT", event: message.event });
        }
      },
    });

    socketRef.current = socket;

    setConnectionStatus("connecting");

    socket.addEventListener("open", () => {
      setConnectionStatus("connected");
    });

    socket.addEventListener("close", () => {
      setConnectionStatus("disconnected");
    });

    return () => {
      socketRef.current = null;
      socket.close();
    };
  }, [uiState.phase, uiState.gameCode, uiState.me.playerId]);

  useEffect(() => {
    if (uiState.phase !== "inGame" || hasNavigated) return;
    const hasBothPlayers = Boolean(uiState.players.A && uiState.players.B);
    if (!hasBothPlayers) return;
    const slug = (uiState.me.name || "player").toLowerCase().replace(/\s+/g, "-");
    setHasNavigated(true);
    navigate(`/${slug}/army-selector`, {
      state: { slot: uiState.slot, gameCode: uiState.gameCode },
    });
  }, [uiState.phase, uiState.players, uiState.me.name, hasNavigated, navigate]);

  const sendLocalEvent = (event) => {
    if (!event?.id) return;
    eventDispatch({ type: "APPLY_REMOTE_EVENT", event });
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          type: "EVENT",
          code: uiState.gameCode,
          slot: uiState.slot,
          event,
        }),
      );
    }
  };

  const emitEvent = (kind, payload = {}) => {
    const event = {
      id: buildEventId(),
      ts: Date.now(),
      by: uiState.me.playerId,
      slot: uiState.slot,
      kind,
      payload,
    };
    sendLocalEvent(event);
    return event;
  };

  useEffect(() => {
    if (uiState.phase !== "inGame") return undefined;
    window.ktSendEvent = emitEvent;
    return () => {
      if (window.ktSendEvent === emitEvent) {
        delete window.ktSendEvent;
      }
    };
  }, [emitEvent, uiState.phase]);

  return (
    <div className="lobby-screen">
      <div className="lobby-panel">
        {uiState.phase === "start" && (
          <>
            <h1 className="lobby-title">Multiplayer</h1>
            <div className="lobby-actions">
              <button className="lobby-btn lobby-btn--primary" onClick={handleCreate}>
                Create game
              </button>
              <button
                className="lobby-btn"
                onClick={() =>
                  setUiState((prev) => ({
                    ...prev,
                    phase: "join",
                  }))
                }
              >
                Join game
              </button>
            </div>
          </>
        )}

        {uiState.phase === "join" && (
          <>
            <h1 className="lobby-title">Join game</h1>
            <div className="lobby-field">
              <label htmlFor="game-code">Game code</label>
              <input
                id="game-code"
                value={uiState.gameCode}
                onChange={(event) =>
                  setUiState((prev) => ({
                    ...prev,
                    gameCode: event.target.value.toUpperCase(),
                  }))
                }
                placeholder="K7F3"
              />
            </div>
            <div className="lobby-field">
              <label>Slot</label>
              <div className="lobby-slot-row">
                {["A", "B"].map((slot) => (
                  <button
                    key={slot}
                    className={`lobby-slot ${uiState.slot === slot ? "lobby-slot--active" : ""}`}
                    onClick={() =>
                      setUiState((prev) => ({
                        ...prev,
                        slot,
                      }))
                    }
                  >
                    Player {slot}
                  </button>
                ))}
              </div>
            </div>
            <div className="lobby-field">
              <label htmlFor="player-name">Display name</label>
              <input
                id="player-name"
                value={uiState.me.name}
                onChange={(event) => updateName(event.target.value)}
                placeholder="Your name"
              />
            </div>
            <div className="lobby-actions">
              <button className="lobby-btn" onClick={handleReset}>
                Back
              </button>
              <button
                className="lobby-btn lobby-btn--primary"
                onClick={handleJoin}
                disabled={!canJoin}
              >
                Enter game
              </button>
            </div>
            {error && <div className="lobby-error">{error}</div>}
          </>
        )}

        {uiState.phase === "inGame" && (
          <>
            <h1 className="lobby-title">Game {uiState.gameCode || "(local)"}</h1>
            <div className="lobby-status">
              <div>
                You are Player {uiState.slot} ({uiState.me.name})
              </div>
              <div className="lobby-players">
                <div>
                  <strong>Player A:</strong> {uiState.players.A?.name || "—"}
                </div>
                <div>
                  <strong>Player B:</strong> {uiState.players.B?.name || "—"}
                </div>
              </div>
              <div className="lobby-sub">
                Status: {connectionStatus} · Events: {eventState.eventLog.length}
              </div>
            </div>
            <div className="lobby-actions">
              <button className="lobby-btn" onClick={handleReset}>
                Leave game
              </button>
            </div>
            {error && <div className="lobby-error">{error}</div>}
          </>
        )}
      </div>
    </div>
  );
}

export default MultiplayerLobby;
