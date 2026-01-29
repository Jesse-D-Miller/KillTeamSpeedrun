import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import "./UnitSelector.css";
import { getOrCreatePlayerId } from "../../lib/playerIdentity";
import { connectWS } from "../../lib/multiplayer";
import universalEquipmentData from "../../data/universalEquipment.json";

const killteamModules = import.meta.glob("../../data/killteams/*.json", {
	eager: true,
});

const factionEquipmentModules = import.meta.glob(
	"../../data/killteams/**/**/*FactionEquipment.json",
	{ eager: true },
);

function normalizeKillteamData(moduleData) {
	if (Array.isArray(moduleData)) return moduleData;
	if (Array.isArray(moduleData?.default)) return moduleData.default;
	return [];
}

function normalizeEquipmentData(moduleData) {
	if (!moduleData) return null;
	return moduleData?.default || moduleData;
}

const resolveEquipmentImage = (image, index = 0) => {
	const imageList = Array.isArray(image) ? image : [image];
	const imageValue = imageList[Math.max(0, Math.min(index, imageList.length - 1))];
	if (!imageValue) return "/killteamSpeedrunLogo.png";
	if (typeof imageValue !== "string") return "/killteamSpeedrunLogo.png";
	if (imageValue.startsWith("http://") || imageValue.startsWith("https://")) return imageValue;
	if (imageValue.startsWith("/")) return imageValue;
	if (imageValue.startsWith("public/")) return `/${imageValue.slice("public/".length)}`;
	return `/${imageValue}`;
};

const getEquipmentImages = (image) =>
	Array.isArray(image) ? image.filter(Boolean) : image ? [image] : [];

function formatFactionName(key) {
	if (!key) return "Unknown";
	return String(key)
		.replace(/[-_]+/g, " ")
		.replace(/\b\w/g, (c) => c.toUpperCase());
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
	const equipmentFlashTimerRef = useRef(null);

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

	const storageKeyForUnits = (slotId) =>
		gameCode ? `kt_game_${gameCode}_units_${slotId}` : null;

	const storageKeyForWeapons = (slotId) =>
		gameCode ? `kt_game_${gameCode}_weapons_${slotId}` : null;

	const storageKeyForEquipment = (slotId) =>
		gameCode ? `kt_game_${gameCode}_equipment_${slotId}` : null;

	const readStoredJson = (storageKey) => {
		if (!storageKey) return null;
		const raw = localStorage.getItem(storageKey);
		if (!raw) return null;
		try {
			return JSON.parse(raw);
		} catch {
			return null;
		}
	};

	const readReadyState = (slotId) => {
		const key = storageKeyForReady(slotId);
		if (!key) return false;
		return localStorage.getItem(key) === "true";
	};

	const [flashEquipmentLimit, setFlashEquipmentLimit] = useState(false);
	const [equipmentImageIndex, setEquipmentImageIndex] = useState({});

	const [readySlots, setReadySlots] = useState(() => ({
		A: readReadyState("A"),
		B: readReadyState("B"),
	}));

	const triggerEquipmentLimitFlash = () => {
		setFlashEquipmentLimit(true);
		if (equipmentFlashTimerRef.current) {
			clearTimeout(equipmentFlashTimerRef.current);
		}
		equipmentFlashTimerRef.current = setTimeout(() => {
			setFlashEquipmentLimit(false);
			equipmentFlashTimerRef.current = null;
		}, 500);
	};

	const handleEquipmentImageNav = (equipmentId, direction, totalImages) => {
		if (!equipmentId || totalImages <= 1) return;
		setEquipmentImageIndex((prev) => {
			const current = Number(prev[equipmentId] ?? 0);
			const nextRaw = direction === "prev" ? current - 1 : current + 1;
			const next = (nextRaw + totalImages) % totalImages;
			return { ...prev, [equipmentId]: next };
		});
	};

	useEffect(() => () => {
		if (equipmentFlashTimerRef.current) {
			clearTimeout(equipmentFlashTimerRef.current);
		}
	}, []);

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

	const applyRosterEvent = (event) => {
		if (!event || event.kind !== "ROSTER_SELECTED") return;
		const eventSlot = event.slot;
		const payload = event.payload || {};
		if (!eventSlot) return;
		const unitsKey = storageKeyForUnits(eventSlot);
		const weaponsKey = storageKeyForWeapons(eventSlot);
		const equipmentKey = storageKeyForEquipment(eventSlot);
		if (unitsKey) {
			localStorage.setItem(unitsKey, JSON.stringify(payload.selectedUnitIds || []));
		}
		if (weaponsKey) {
			localStorage.setItem(
				weaponsKey,
				JSON.stringify(payload.selectedWeaponsByUnitId || {}),
			);
		}
		if (equipmentKey) {
			localStorage.setItem(
				equipmentKey,
				JSON.stringify(payload.selectedEquipmentIds || []),
			);
		}
		if (eventSlot === slot) {
			if (Array.isArray(payload.selectedUnitIds)) {
				setSelectedUnitIdsA(payload.selectedUnitIds);
			}
			if (payload.selectedWeaponsByUnitId && typeof payload.selectedWeaponsByUnitId === "object") {
				setWeaponSelectionsA(payload.selectedWeaponsByUnitId);
			}
			if (Array.isArray(payload.selectedEquipmentIds)) {
				setSelectedEquipmentIds(payload.selectedEquipmentIds);
			}
		}
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
					message.eventLog.forEach(applyRosterEvent);
					return;
				}
				if (message.type === "EVENT" && message.event) {
					applyArmyEvent(message.event);
					applyReadyEvent(message.event);
					applyRosterEvent(message.event);
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
	const isReadyClicked = slot ? Boolean(readySlots[slot]) : false;

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
	const [selectedUnitIdsA, setSelectedUnitIdsA] = useState(() => {
		if (!gameCode || !slot) return [];
		const stored = readStoredJson(storageKeyForUnits(slot));
		return Array.isArray(stored) ? stored : [];
	});
	const [selectedUnitIdsB, setSelectedUnitIdsB] = useState([]);
	const [weaponSelectionsA, setWeaponSelectionsA] = useState(() => {
		if (!gameCode || !slot) return {};
		const stored = readStoredJson(storageKeyForWeapons(slot));
		return stored && typeof stored === "object" ? stored : {};
	});
	const [weaponSelectionsB, setWeaponSelectionsB] = useState({});
	const [unitModal, setUnitModal] = useState({
		open: false,
		team: "alpha",
		unitId: null,
	});
	const [selectedEquipmentIds, setSelectedEquipmentIds] = useState(() => {
		if (!gameCode || !slot) return [];
		const stored = readStoredJson(storageKeyForEquipment(slot));
		return Array.isArray(stored) ? stored : [];
	});

	const selectedFactionKey = isSingleSelect
		? playerArmyKey
		: activeTeam === "alpha"
			? resolvedArmyKeyA
			: resolvedArmyKeyB;

	const universalEquipment = useMemo(() => {
		const data = normalizeEquipmentData(universalEquipmentData);
		return Array.isArray(data?.equipment) ? data.equipment : [];
	}, []);

	const factionEquipment = useMemo(() => {
		if (!selectedFactionKey) return [];
		const keyLower = String(selectedFactionKey).toLowerCase();
		const entry = Object.entries(factionEquipmentModules).find(([path]) => {
			const normalized = path.toLowerCase();
			return (
				normalized.includes(`/${keyLower}/`) ||
				normalized.includes(`${keyLower}factionequipment`)
			);
		});
		const data = normalizeEquipmentData(entry?.[1]);
		return Array.isArray(data?.equipment) ? data.equipment : [];
	}, [selectedFactionKey]);

	const tacOpsPlaceholders = useMemo(
		() => ["tac-ops-1", "tac-ops-2", "tac-ops-3"],
		[],
	);

	const getDefaultRoster = (armyKey, units, equipmentList = []) => {
		if (!armyKey) return null;
		const key = String(armyKey).toLowerCase();
		if (key === "kommandos") {
			const excluded = new Set([
				"kommando-super-boy",
				"kommando-grot",
				"kommando-bomb-squig",
			]);
			const unitIds = units
				.filter((unit) => !excluded.has(unit.id))
				.map((unit) => unit.id);
			const weaponSelections = units.reduce((acc, unit) => {
				if (!unitIds.includes(unit.id)) return acc;
				const weaponNames = Array.isArray(unit.weapons)
					? unit.weapons.map((weapon) => weapon.name)
					: [];
				if (unit.id === "kommando-boss-nob") {
					const desired = ["Slugga", "Power klaw"];
					acc[unit.id] = desired.filter((name) => weaponNames.includes(name));
					return acc;
				}
				acc[unit.id] = weaponNames;
				return acc;
			}, {});
			const equipmentIds = equipmentList.map((item) => item.id);
			return { unitIds, weaponSelections, equipmentIds };
		}
		if (key === "hernkynyaegirs") {
			const unitIds = units.map((unit) => unit.id);
			const weaponSelections = units.reduce((acc, unit) => {
				if (!unit?.id) return acc;
				const weaponNames = Array.isArray(unit.weapons)
					? unit.weapons.map((weapon) => weapon.name)
					: [];
				if (unit.id === "yaegir-warrior-1") {
					const desired = [
						"Bolt shotgun (short range)",
						"Bolt shotgun (long range)",
						"Fists",
					];
					acc[unit.id] = desired.filter((name) => weaponNames.includes(name));
					return acc;
				}
				if (unit.id === "yaegir-warrior-2" || unit.id === "yaegir-warrior-3") {
					const desired = ["Bolt revolver", "Plasma knife"];
					acc[unit.id] = desired.filter((name) => weaponNames.includes(name));
					return acc;
				}
				acc[unit.id] = weaponNames;
				return acc;
			}, {});
			const equipmentIds = equipmentList.map((item) => item.id);
			return { unitIds, weaponSelections, equipmentIds };
		}
		return null;
	};

	const canSelectUnits = isSingleSelect
		? selectedUnitIdsA.length > 0 && !waitingForOpponent
		: selectedUnitIdsA.length > 0 && selectedUnitIdsB.length > 0;
	const canNavigate = canSelectUnits && (!gameCode || bothReady);
	const hasNavigatedRef = useRef(false);
	const isRosterLocked = Boolean(gameCode && isReadyClicked);

	const navigateToArmy = (override = {}) => {
		const {
			selectedUnitIds = selectedUnitIdsA,
			selectedWeaponsByUnitId = weaponSelectionsA,
			selectedUnitIdsAlpha = selectedUnitIdsA,
			selectedUnitIdsBeta = selectedUnitIdsB,
			selectedWeaponsByUnitIdA = weaponSelectionsA,
			selectedWeaponsByUnitIdB = weaponSelectionsB,
		} = override;
		navigate(`/${username}/strategy-phase`, {
			state: isSingleSelect
				? {
						armyKey,
						armyKeyA: resolvedArmyKeyA,
						armyKeyB: resolvedArmyKeyB,
						selectedUnitIds,
						selectedWeaponsByUnitId,
						slot,
						gameCode,
						bothReady,
					}
				: {
						armyKeyA: resolvedArmyKeyA,
						armyKeyB: resolvedArmyKeyB,
						selectedUnitIdsA: selectedUnitIdsAlpha,
						selectedUnitIdsB: selectedUnitIdsBeta,
						selectedWeaponsByUnitIdA,
						selectedWeaponsByUnitIdB,
						bothReady,
					},
		});
	};

	useEffect(() => {
		if (!gameCode || !slot) return;
		if (!bothReady || !isReadyClicked) return;
		if (!canSelectUnits || hasNavigatedRef.current) return;
		hasNavigatedRef.current = true;
		navigateToArmy();
	}, [bothReady, isReadyClicked, canSelectUnits, gameCode, slot]);

	const ensureWeaponSelections = (team, unit) => {
		if (!unit?.id) return;
		const weapons = Array.isArray(unit.weapons)
			? unit.weapons.map((weapon) => weapon.name)
			: [];
		if (team === "alpha") {
			setWeaponSelectionsA((prev) =>
				prev[unit.id] ? prev : { ...prev, [unit.id]: weapons },
			);
			return;
		}
		setWeaponSelectionsB((prev) =>
			prev[unit.id] ? prev : { ...prev, [unit.id]: weapons },
		);
	};

	const openUnitModal = (unit, team) => {
		if (!unit) return;
		if (isRosterLocked) return;
		if (team === "alpha") {
			setSelectedUnitIdsA((prev) =>
				prev.includes(unit.id) ? prev : [...prev, unit.id],
			);
		} else {
			setSelectedUnitIdsB((prev) =>
				prev.includes(unit.id) ? prev : [...prev, unit.id],
			);
		}
		ensureWeaponSelections(team, unit);
		setUnitModal({ open: true, team, unitId: unit.id });
	};

	const closeUnitModal = () =>
		setUnitModal((prev) => ({ ...prev, open: false, unitId: null }));

	const removeUnitFromRoster = () => {
		if (!unitModal.unitId) return;
		if (isRosterLocked) return;
		if (unitModal.team === "alpha") {
			setSelectedUnitIdsA((prev) => prev.filter((id) => id !== unitModal.unitId));
			setWeaponSelectionsA((prev) => {
				const next = { ...prev };
				delete next[unitModal.unitId];
				return next;
			});
		} else {
			setSelectedUnitIdsB((prev) => prev.filter((id) => id !== unitModal.unitId));
			setWeaponSelectionsB((prev) => {
				const next = { ...prev };
				delete next[unitModal.unitId];
				return next;
			});
		}
		closeUnitModal();
	};

	const getWeaponSelectionsForUnit = (team, unitId) => {
		if (!unitId) return [];
		const source = team === "alpha" ? weaponSelectionsA : weaponSelectionsB;
		return Array.isArray(source[unitId]) ? source[unitId] : [];
	};

	const toggleWeaponForUnit = (team, unitId, weaponName) => {
		if (!unitId || !weaponName) return;
		const updater = (prev) => {
			const existing = Array.isArray(prev[unitId]) ? prev[unitId] : [];
			const next = existing.includes(weaponName)
				? existing.filter((name) => name !== weaponName)
				: [...existing, weaponName];
			return { ...prev, [unitId]: next };
		};
		if (team === "alpha") {
			setWeaponSelectionsA(updater);
			return;
		}
		setWeaponSelectionsB(updater);
	};

	const formatWeaponRules = (wr) => {
		if (!wr || wr === "-") return "-";
		const list = Array.isArray(wr) ? wr : [wr];
		return list
			.map((rule) => {
				if (!rule) return "";
				if (typeof rule === "string") return rule;
				const id = rule.id || "";
				const value =
					rule.value !== undefined && rule.value !== null
						? ` ${rule.value}`
						: "";
				const note = rule.note ? ` (${rule.note})` : "";
				return `${id}${value}${note}`.trim();
			})
			.filter(Boolean)
			.join(", ") || "-";
	};

	const toggleEquipmentSelection = (equipmentId) => {
		if (!equipmentId) return;
		if (isRosterLocked) return;
		setSelectedEquipmentIds((prev) => {
			if (prev.includes(equipmentId)) {
				return prev.filter((id) => id !== equipmentId);
			}
			if (prev.length >= 4) return prev;
			return [...prev, equipmentId];
		});
	};

	const isEquipmentAtLimit = selectedEquipmentIds.length >= 4;

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

	const modalUnitSource = unitModal.team === "alpha" ? armyUnitsA : armyUnitsB;
	const modalUnit = unitModal.unitId
		? modalUnitSource.find((unit) => unit.id === unitModal.unitId)
		: null;
	const modalWeaponSelections = getWeaponSelectionsForUnit(
		unitModal.team,
		unitModal.unitId,
	);
	const modalWeaponCount = Array.isArray(modalUnit?.weapons)
		? modalUnit.weapons.length
		: 0;
	const defaultRoster = useMemo(
		() => getDefaultRoster(selectedFactionKey, activeUnits, factionEquipment),
		[selectedFactionKey, activeUnits, factionEquipment],
	);
	const canUseDefault = Boolean(defaultRoster?.unitIds?.length);

	useEffect(() => {
		if (!canUseDefault || isRosterLocked) return;
		if (isSingleSelect) {
			if (selectedUnitIdsA.length === 0) {
				setSelectedUnitIdsA(defaultRoster.unitIds);
				setWeaponSelectionsA(defaultRoster.weaponSelections);
			}
		} else if (activeTeam === "alpha") {
			if (selectedUnitIdsA.length === 0) {
				setSelectedUnitIdsA(defaultRoster.unitIds);
				setWeaponSelectionsA(defaultRoster.weaponSelections);
			}
		} else if (activeTeam === "beta") {
			if (selectedUnitIdsB.length === 0) {
				setSelectedUnitIdsB(defaultRoster.unitIds);
				setWeaponSelectionsB(defaultRoster.weaponSelections);
			}
		}
		if (selectedEquipmentIds.length === 0 && defaultRoster.equipmentIds.length > 0) {
			setSelectedEquipmentIds(defaultRoster.equipmentIds);
		}
	}, [
		activeTeam,
		canUseDefault,
		defaultRoster,
		isRosterLocked,
		isSingleSelect,
		selectedEquipmentIds.length,
		selectedUnitIdsA.length,
		selectedUnitIdsB.length,
	]);

	return (
		<div className="unit-selector" data-testid="screen-root">
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

				<div className="unit-selector__sections">
					<div className="unit-selector__section">
						<div className="unit-selector__section-title">
							Units
							<span className="unit-selector__section-count">
								{selectedIds.length} selected
							</span>
						</div>
						<div className="unit-selector__section-list">
							{activeUnits.map((unit) => {
								const isSelected = selectedIds.includes(unit.id);
								return (
									<button
										key={unit.id}
										className={`unit-selector__tile ${
											isSelected ? "unit-selector__tile--selected" : ""
										}`}
										type="button"
										disabled={isRosterLocked}
										onClick={() =>
											openUnitModal(
												unit,
												isSingleSelect ? "alpha" : activeTeam,
											)
										}
									>
										<span className="unit-selector__tile-name">{unit.name}</span>
									</button>
								);
							})}
						</div>
					</div>

					<div className="unit-selector__section">
						<div className="unit-selector__section-title">
							Faction Equipment — {formatFactionName(selectedFactionKey)}
							<span className="unit-selector__section-count">
								{selectedEquipmentIds.length}/4 selected
							</span>
						</div>
						{selectedFactionKey ? (
							factionEquipment.length === 0 ? (
								<div className="unit-selector__equipment-empty">
									No faction equipment found for this team.
								</div>
							) : (
								<div className="unit-selector__section-list unit-selector__equipment-grid">
									{factionEquipment.map((item) => {
										const isSelected = selectedEquipmentIds.includes(item.id);
										const isLimitBlocked = !isSelected && isEquipmentAtLimit;
										const isDisabled = isRosterLocked;
										const images = getEquipmentImages(item.image);
										const imageIndex = Math.max(
											0,
											Math.min(
												Number(equipmentImageIndex[item.id] ?? 0),
												Math.max(0, images.length - 1),
											),
										);
										const imageSrc = resolveEquipmentImage(item.image, imageIndex);
										const hasMultipleImages = images.length > 1;
										return (
											<button
												key={item.id || item.name}
												className={`unit-selector__tile unit-selector__equipment-tile ${
													isSelected ? "unit-selector__tile--selected" : ""
												} ${
													isLimitBlocked ? "unit-selector__tile--limit" : ""
												} ${
													isLimitBlocked && flashEquipmentLimit
														? "unit-selector__equipment-tile--limit-flash"
														: ""
												}`}
												type="button"
												disabled={isDisabled}
												aria-disabled={isDisabled || isLimitBlocked}
												onClick={() => {
													if (isDisabled) return;
													if (isLimitBlocked) {
														triggerEquipmentLimitFlash();
														return;
													}
													toggleEquipmentSelection(item.id);
											}}
											aria-label={item.name || item.id}
										>
											{hasMultipleImages && (
												<div className="unit-selector__equipment-dots" aria-hidden="true">
													{images.map((_, idx) => (
														<span
															key={`${item.id}-dot-${idx}`}
															className={`unit-selector__equipment-dot ${
																idx === imageIndex
																	? "unit-selector__equipment-dot--active"
																	: ""
															}`}
														/>
													))}
												</div>
											)}
											{hasMultipleImages && (
												<>
													<button
														className="unit-selector__equipment-nav unit-selector__equipment-nav--left"
														type="button"
														aria-label="Previous equipment image"
														onClick={(event) => {
															event.stopPropagation();
															handleEquipmentImageNav(item.id, "prev", images.length);
														}}
													>
														<span aria-hidden="true">‹</span>
													</button>
													<button
														className="unit-selector__equipment-nav unit-selector__equipment-nav--right"
														type="button"
														aria-label="Next equipment image"
														onClick={(event) => {
															event.stopPropagation();
															handleEquipmentImageNav(item.id, "next", images.length);
														}}
													>
														<span aria-hidden="true">›</span>
													</button>
												</>
											)}
											<img
												className="unit-selector__equipment-image"
												src={imageSrc}
												alt={item.name || item.id}
												loading="lazy"
											/>
										</button>
									);
								})}
							</div>
						)
						) : (
							<div className="unit-selector__equipment-empty">
								Select a faction to view equipment.
							</div>
						)}
					</div>

					<div className="unit-selector__section">
						<div className="unit-selector__section-title">
							Universal Equipment
							<span className="unit-selector__section-count">
								{selectedEquipmentIds.length}/4 selected
							</span>
						</div>
						{universalEquipment.length === 0 ? (
							<div className="unit-selector__equipment-empty">
								No universal equipment found.
							</div>
						) : (
							<div className="unit-selector__section-list unit-selector__equipment-grid">
								{universalEquipment.map((item) => {
									const isSelected = selectedEquipmentIds.includes(item.id);
									const isLimitBlocked = !isSelected && isEquipmentAtLimit;
									const isDisabled = isRosterLocked;
									const images = getEquipmentImages(item.image);
									const imageIndex = Math.max(
										0,
										Math.min(
											Number(equipmentImageIndex[item.id] ?? 0),
											Math.max(0, images.length - 1),
										),
									);
									const imageSrc = resolveEquipmentImage(item.image, imageIndex);
									const hasMultipleImages = images.length > 1;
									return (
										<button
											key={item.id || item.name}
											className={`unit-selector__tile unit-selector__equipment-tile ${
												isSelected ? "unit-selector__tile--selected" : ""
											} ${
												isLimitBlocked ? "unit-selector__tile--limit" : ""
											} ${
												isLimitBlocked && flashEquipmentLimit
													? "unit-selector__equipment-tile--limit-flash"
													: ""
											}`}
											type="button"
											disabled={isDisabled}
											aria-disabled={isDisabled || isLimitBlocked}
											onClick={() => {
												if (isDisabled) return;
												if (isLimitBlocked) {
													triggerEquipmentLimitFlash();
													return;
												}
												toggleEquipmentSelection(item.id);
											}}
											aria-label={item.name || item.id}
										>
											{hasMultipleImages && (
												<div className="unit-selector__equipment-dots" aria-hidden="true">
													{images.map((_, idx) => (
														<span
															key={`${item.id}-dot-${idx}`}
															className={`unit-selector__equipment-dot ${
																idx === imageIndex
																	? "unit-selector__equipment-dot--active"
																	: ""
															}`}
														/>
													))}
												</div>
											)}
											{hasMultipleImages && (
												<>
													<button
														className="unit-selector__equipment-nav unit-selector__equipment-nav--left"
														type="button"
														aria-label="Previous equipment image"
														onClick={(event) => {
															event.stopPropagation();
															handleEquipmentImageNav(item.id, "prev", images.length);
														}}
													>
														<span aria-hidden="true">‹</span>
													</button>
													<button
														className="unit-selector__equipment-nav unit-selector__equipment-nav--right"
														type="button"
														aria-label="Next equipment image"
														onClick={(event) => {
															event.stopPropagation();
															handleEquipmentImageNav(item.id, "next", images.length);
														}}
													>
														<span aria-hidden="true">›</span>
													</button>
												</>
											)}
											<img
												className="unit-selector__equipment-image"
												src={imageSrc}
												alt={item.name || item.id}
												loading="lazy"
											/>
										</button>
									);
								})}
							</div>
						)}
					</div>

					<div className="unit-selector__section">
						<div className="unit-selector__section-title">
							Tac Ops
							<span className="unit-selector__section-count">0/3 selected</span>
						</div>
						<div className="unit-selector__section-list unit-selector__equipment-grid">
							{tacOpsPlaceholders.map((id) => (
								<button
									key={id}
									className="unit-selector__tile unit-selector__equipment-tile"
									type="button"
									disabled
									aria-label="Tac Ops placeholder"
								>
									<img
										className="unit-selector__equipment-image"
										src="/killteamSpeedrunLogo.png"
										alt="Tac Ops"
										loading="lazy"
									/>
								</button>
							))}
						</div>
					</div>
				</div>

				{unitModal.open && modalUnit && (
					<div className="kt-modal">
						<div className="kt-modal__backdrop" onClick={closeUnitModal} />
						<div className="kt-modal__panel">
							<button
								className="kt-modal__close"
								type="button"
								onClick={closeUnitModal}
								aria-label="Close"
								title="Close"
							>
								×
							</button>
							<div className="kt-modal__layout">
								<aside className="kt-modal__sidebar">
									<div className="kt-modal__sidebar-title">Loadout</div>
									<div className="kt-modal__sidebar-empty">
										Select which weapons this unit can use.
									</div>
									<div className="unit-selector__modal-meta">
										<div>APL {modalUnit.stats?.apl ?? "-"}</div>
										<div>Move {modalUnit.stats?.move ?? "-"}</div>
										<div>Save {modalUnit.stats?.save ?? "-"}+</div>
										<div>Wounds {modalUnit.stats?.woundsMax ?? "-"}</div>
									</div>
									<div className="kt-modal__sidebar-spacer" />
									<button
										className="kt-modal__btn"
										type="button"
										onClick={removeUnitFromRoster}
									>
										Remove Unit
									</button>
									<button
										className="kt-modal__btn kt-modal__btn--primary"
										type="button"
										onClick={closeUnitModal}
										disabled={modalWeaponCount > 0 && modalWeaponSelections.length === 0}
									>
										Save
									</button>
								</aside>
								<div className="kt-modal__content">
									<div className="kt-modal__header">
										<div className="kt-modal__title">{modalUnit.name}</div>
										<div className="kt-modal__subtitle">
											Choose weapons for this game.
										</div>
									</div>
									<div className="unit-selector__weapon-list">
										{Array.isArray(modalUnit.weapons) && modalUnit.weapons.length > 0 ? (
											modalUnit.weapons.map((weapon) => {
												const isChecked = modalWeaponSelections.includes(weapon.name);
												return (
													<label
														key={weapon.name}
														className={`unit-selector__weapon ${
															isChecked ? "unit-selector__weapon--selected" : ""
														}`}
													>
														<input
															type="checkbox"
															checked={isChecked}
															onChange={() =>
																toggleWeaponForUnit(
																	unitModal.team,
																	unitModal.unitId,
																	weapon.name,
																)
															}
														/>
														<div className="unit-selector__weapon-body">
															<div className="unit-selector__weapon-name">{weapon.name}</div>
															<div className="unit-selector__weapon-stats">
																ATK {weapon.atk ?? weapon.profile?.atk ?? "-"} · HIT {weapon.hit ?? weapon.profile?.hit ?? "-"} · DMG {weapon.dmg ?? weapon.profile?.dmg ?? "-"}
															</div>
															<div className="unit-selector__weapon-rules">
																WR: {formatWeaponRules(weapon.wr ?? weapon.rules)}
															</div>
														</div>
													</label>
												);
											})
										) : (
											<div className="kt-modal__empty">No weapons available.</div>
										)}
									</div>
								</div>
							</div>
						</div>
					</div>
				)}

				<div className="unit-selector__actions">
					<button
						className="unit-selector__next"
						type="button"
						disabled={(!canSelectUnits && !canUseDefault) || isReadyClicked}
						onClick={() => {
							let resolvedUnitIdsA = selectedUnitIdsA;
							let resolvedWeaponsA = weaponSelectionsA;
							let resolvedUnitIdsB = selectedUnitIdsB;
							let resolvedWeaponsB = weaponSelectionsB;
							let resolvedEquipmentIds = selectedEquipmentIds;

							if (canUseDefault) {
								if (isSingleSelect) {
									if (resolvedUnitIdsA.length === 0) {
										resolvedUnitIdsA = defaultRoster.unitIds;
										resolvedWeaponsA = defaultRoster.weaponSelections;
										setSelectedUnitIdsA(resolvedUnitIdsA);
										setWeaponSelectionsA(resolvedWeaponsA);
									}
								} else if (activeTeam === "alpha") {
									if (resolvedUnitIdsA.length === 0) {
										resolvedUnitIdsA = defaultRoster.unitIds;
										resolvedWeaponsA = defaultRoster.weaponSelections;
										setSelectedUnitIdsA(resolvedUnitIdsA);
										setWeaponSelectionsA(resolvedWeaponsA);
									}
								} else if (activeTeam === "beta") {
									if (resolvedUnitIdsB.length === 0) {
										resolvedUnitIdsB = defaultRoster.unitIds;
										resolvedWeaponsB = defaultRoster.weaponSelections;
										setSelectedUnitIdsB(resolvedUnitIdsB);
										setWeaponSelectionsB(resolvedWeaponsB);
									}
								}
								if (resolvedEquipmentIds.length === 0) {
									resolvedEquipmentIds = defaultRoster.equipmentIds;
									setSelectedEquipmentIds(resolvedEquipmentIds);
								}
							}

							if (gameCode && slot) {
								const unitsKey = storageKeyForUnits(slot);
								const weaponsKey = storageKeyForWeapons(slot);
								const equipmentKey = storageKeyForEquipment(slot);
								if (unitsKey) {
									localStorage.setItem(
										unitsKey,
										JSON.stringify(resolvedUnitIdsA),
									);
								}
								if (weaponsKey) {
									localStorage.setItem(
										weaponsKey,
										JSON.stringify(resolvedWeaponsA),
									);
								}
								if (equipmentKey) {
									localStorage.setItem(
										equipmentKey,
										JSON.stringify(resolvedEquipmentIds),
									);
								}
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
												kind: "ROSTER_SELECTED",
												payload: {
													selectedUnitIds: resolvedUnitIdsA,
													selectedWeaponsByUnitId: resolvedWeaponsA,
													selectedEquipmentIds: resolvedEquipmentIds,
												},
											},
										}),
									);
								}
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
								if (bothReady) {
									navigateToArmy();
								}
								return;
							}

							if (canNavigate) {
								navigateToArmy({
									selectedUnitIds: resolvedUnitIdsA,
									selectedWeaponsByUnitId: resolvedWeaponsA,
									selectedUnitIdsAlpha: resolvedUnitIdsA,
									selectedUnitIdsBeta: resolvedUnitIdsB,
									selectedWeaponsByUnitIdA: resolvedWeaponsA,
									selectedWeaponsByUnitIdB: resolvedWeaponsB,
								});
							}
						}}
					>
						{isReadyClicked && !bothReady ? (
							<>
								<span className="unit-selector__spinner" aria-hidden="true" />
								Waiting for opponent...
							</>
						) : (
							"Start"
						)}
					</button>
				</div>
			</div>
		</div>
	);
}

export default UnitSelector;
