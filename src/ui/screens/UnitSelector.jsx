import { useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import "./UnitSelector.css";

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
	const armyKeyA = location.state?.armyKeyA;
	const armyKeyB = location.state?.armyKeyB;
	const isSingleSelect = Boolean(armyKey);

	const armyUnitsA = useMemo(() => {
		const key = isSingleSelect ? armyKey : armyKeyA;
		if (!key) return [];
		const entry = Object.entries(killteamModules).find(([path]) =>
			path.includes(`${key}.json`),
		);
		if (!entry) return [];
		return normalizeKillteamData(entry[1]);
	}, [armyKey, armyKeyA, isSingleSelect]);

	const armyUnitsB = useMemo(() => {
		if (isSingleSelect || !armyKeyB) return [];
		const entry = Object.entries(killteamModules).find(([path]) =>
			path.includes(`${armyKeyB}.json`),
		);
		if (!entry) return [];
		return normalizeKillteamData(entry[1]);
	}, [armyKeyB, isSingleSelect]);

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
								? selectedUnitIdsA.length === 0
								: selectedUnitIdsA.length === 0 || selectedUnitIdsB.length === 0
						}
						onClick={() =>
							navigate(`/${username}/army`, {
								state: isSingleSelect
									? {
											armyKey,
											selectedUnitIds: selectedUnitIdsA,
											slot,
										}
									: {
											armyKeyA,
											armyKeyB,
											selectedUnitIdsA,
											selectedUnitIdsB,
										},
							})
						}
					>
						Next
					</button>
				</div>
			</div>
		</div>
	);
}

export default UnitSelector;
