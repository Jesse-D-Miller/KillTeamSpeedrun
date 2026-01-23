import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import "./UnitSelector.css";
import { getOrCreatePlayerId } from "../../lib/playerIdentity";
import { connectWS } from "../../lib/multiplayer";

const killteamModules = import.meta.glob("../../data/killteams/*.json", {
	eager: true,
});

function normalizeKillteamData(moduleData) {
	if (Array.isArray(moduleData)) return moduleData;
	if (Array.isArray(moduleData?.default)) return moduleData.default;
	return [];
}

function UnitSelector() {
	const { username } = useParams();
	const navigate = useNavigate();
	const location = useLocation();
	const armyKey = location.state?.armyKey;
	const slot = location.state?.slot;
	const gameCode = location.state?.gameCode;
	const armyKeyA = location.state?.armyKeyA;
	const armyKeyB = location.state?.armyKeyB;
	const isSingleSelect = Boolean(armyKey);
	const socketRef = useRef(null);

	const storageKeyForSlot = (slotId) =>
		gameCode ? `kt_game_${gameCode}_army_${slotId}` : null;

	const readArmySelection = (slotId) => {
		const key = storageKeyForSlot(slotId);
		if (!key) return null;
		return localStorage.getItem(key);
	};

	const [syncedArmies, setSyncedArmies] = useState(() => ({
		A: readArmySelection("A"),
		B: readArmySelection("B"),
	}));

	const storageKeyForReady = (slotId) =>
		gameCode ? `kt_game_${gameCode}_ready_${slotId}` : null;

	const readReadyState = (slotId) => {
		const key = storageKeyForReady(slotId);
		if (!key) return false;
		return localStorage.getItem(key) === "true";
	};

	const [readySlots, setReadySlots] = useState(() => ({
		A: readReadyState("A"),
		B: readReadyState("B"),
	}));

	const applyArmyEvent = (event) => {
		if (!event || event.kind !== "ARMY_SELECTED") return;
		const eventSlot = event.slot;
		const selectedKey = event.payload?.armyKey;
		if (!eventSlot || !selectedKey) return;
		const storageKey = storageKeyForSlot(eventSlot);
		if (storageKey) {
			localStorage.setItem(storageKey, selectedKey);
		}
		setSyncedArmies((prev) => ({ ...prev, [eventSlot]: selectedKey }));
	};

	const applyReadyEvent = (event) => {
		if (!event || event.kind !== "SETUP_READY") return;
		const eventSlot = event.slot;
		if (!eventSlot) return;
		const storageKey = storageKeyForReady(eventSlot);
		if (storageKey) {
			localStorage.setItem(storageKey, "true");
		}
		setReadySlots((prev) => ({ ...prev, [eventSlot]: true }));
	};

	useEffect(() => {
		if (!gameCode || !slot) return undefined;

		const socket = connectWS({
			code: gameCode,
			playerId: getOrCreatePlayerId(),
			onMessage: (message) => {
				if (message.type === "SNAPSHOT" && Array.isArray(message.eventLog)) {
					message.eventLog.forEach(applyArmyEvent);
					message.eventLog.forEach(applyReadyEvent);
					return;
				}
				if (message.type === "EVENT" && message.event) {
					applyArmyEvent(message.event);
					applyReadyEvent(message.event);
				}
			},
		});

		socketRef.current = socket;

		return () => {
			socketRef.current = null;
			socket.close();
		};
	}, [gameCode, slot]);

	const resolvedArmyKeyA =
		armyKeyA ||
		(slot === "A" ? armyKey : null) ||
		syncedArmies.A ||
		null;
	const resolvedArmyKeyB =
		armyKeyB ||
		(slot === "B" ? armyKey : null) ||
		syncedArmies.B ||
		null;
	const playerArmyKey =
		slot === "B" ? resolvedArmyKeyB || armyKey : resolvedArmyKeyA || armyKey;
	const opponentArmyKey = slot === "B" ? resolvedArmyKeyA : resolvedArmyKeyB;
	const waitingForOpponent =
		Boolean(gameCode) && (!playerArmyKey || !opponentArmyKey);
	const bothReady = Boolean(gameCode)
		? Boolean(readySlots.A && readySlots.B)
		: true;

	const armyUnitsA = useMemo(() => {
		const key = isSingleSelect ? playerArmyKey : resolvedArmyKeyA;
		if (!key) return [];
		const entry = Object.entries(killteamModules).find(([path]) =>
			path.includes(`${key}.json`),
		);
		if (!entry) return [];
		return normalizeKillteamData(entry[1]);
	}, [isSingleSelect, playerArmyKey, resolvedArmyKeyA]);

	const armyUnitsB = useMemo(() => {
		if (isSingleSelect || !resolvedArmyKeyB) return [];
		const entry = Object.entries(killteamModules).find(([path]) =>
			path.includes(`${resolvedArmyKeyB}.json`),
		);
		if (!entry) return [];
		return normalizeKillteamData(entry[1]);
	}, [isSingleSelect, resolvedArmyKeyB]);

	const [activeTeam, setActiveTeam] = useState("alpha");
	const [selectedUnitIdsA, setSelectedUnitIdsA] = useState(
		armyUnitsA.map((unit) => unit.id),
	);
	const [selectedUnitIdsB, setSelectedUnitIdsB] = useState(
		armyUnitsB.map((unit) => unit.id),
	);

	const toggleUnit = (unitId) => {
		if (isSingleSelect || activeTeam === "alpha") {
			setSelectedUnitIdsA((prev) =>
				prev.includes(unitId)
					? prev.filter((id) => id !== unitId)
					: [...prev, unitId],
			);
		} else {
			setSelectedUnitIdsB((prev) =>
				prev.includes(unitId)
					? prev.filter((id) => id !== unitId)
					: [...prev, unitId],
			);
		}
	};

	const activeUnits = isSingleSelect
		? armyUnitsA
		: activeTeam === "alpha"
			? armyUnitsA
			: armyUnitsB;

	const selectedIds = isSingleSelect
		? selectedUnitIdsA
		: activeTeam === "alpha"
			? selectedUnitIdsA
			: selectedUnitIdsB;

	return (
		<div className="unit-selector">
			<div className="unit-selector__panel">
				<h1 className="unit-selector__title">Select Units</h1>
				<p className="unit-selector__subtitle">
					Player: <span className="unit-selector__name">{username}</span>
				</p>

				{!isSingleSelect && (
					<div className="unit-selector__tabs">
						<button
							type="button"
							className={`unit-selector__tab ${activeTeam === "alpha" ? "unit-selector__tab--active" : ""}`}
							onClick={() => setActiveTeam("alpha")}
						>
							Team A
						</button>
						<button
							type="button"
							className={`unit-selector__tab ${activeTeam === "beta" ? "unit-selector__tab--active" : ""}`}
							onClick={() => setActiveTeam("beta")}
						>
							Team B
						</button>
					</div>
				)}

				<div className="unit-selector__grid">
					{activeUnits.map((unit) => {
						const isSelected = selectedIds.includes(unit.id);
						return (
							<button
								key={unit.id}
								className={`unit-selector__tile ${
									isSelected ? "unit-selector__tile--selected" : ""
								}`}
								type="button"
								onClick={() => toggleUnit(unit.id)}
							>
								<span className="unit-selector__tile-name">{unit.name}</span>
							</button>
						);
					})}
				</div>

				<div className="unit-selector__actions">
					<button
						className="unit-selector__next"
						type="button"
						disabled={
							isSingleSelect
								? selectedUnitIdsA.length === 0 || waitingForOpponent
								: selectedUnitIdsA.length === 0 || selectedUnitIdsB.length === 0
						}
						onClick={() => {
							if (gameCode && slot) {
								const readyKey = storageKeyForReady(slot);
								if (readyKey) {
									localStorage.setItem(readyKey, "true");
								}
								setReadySlots((prev) => ({ ...prev, [slot]: true }));
								if (socketRef.current?.readyState === WebSocket.OPEN) {
									socketRef.current.send(
										JSON.stringify({
											type: "EVENT",
											code: gameCode,
											slot,
											event: {
												id: getOrCreatePlayerId(),
												ts: Date.now(),
												slot,
												kind: "SETUP_READY",
												payload: {},
											},
										}),
									);
								}
							}

							navigate(`/${username}/army`, {
								state: isSingleSelect
									? {
											armyKey,
											armyKeyA: resolvedArmyKeyA,
											armyKeyB: resolvedArmyKeyB,
											selectedUnitIds: selectedUnitIdsA,
											slot,
											gameCode,
											bothReady,
										}
									: {
											armyKeyA: resolvedArmyKeyA,
											armyKeyB: resolvedArmyKeyB,
											selectedUnitIdsA,
											selectedUnitIdsB,
											bothReady,
										},
							});
						}}
					>
						Next
					</button>
				</div>
			</div>
		</div>
	);
}

export default UnitSelector;
