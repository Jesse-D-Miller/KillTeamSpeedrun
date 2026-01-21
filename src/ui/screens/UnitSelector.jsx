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
	const armyKeyA = location.state?.armyKeyA;
	const armyKeyB = location.state?.armyKeyB;

	const armyUnitsA = useMemo(() => {
		const entry = Object.entries(killteamModules).find(([path]) =>
			path.includes(`${armyKeyA}.json`),
		);
		if (!entry) return [];
		return normalizeKillteamData(entry[1]);
	}, [armyKeyA]);

	const armyUnitsB = useMemo(() => {
		const entry = Object.entries(killteamModules).find(([path]) =>
			path.includes(`${armyKeyB}.json`),
		);
		if (!entry) return [];
		return normalizeKillteamData(entry[1]);
	}, [armyKeyB]);

	const [activeTeam, setActiveTeam] = useState("alpha");
	const [selectedUnitIdsA, setSelectedUnitIdsA] = useState(
		armyUnitsA.map((unit) => unit.id),
	);
	const [selectedUnitIdsB, setSelectedUnitIdsB] = useState(
		armyUnitsB.map((unit) => unit.id),
	);

	const toggleUnit = (unitId) => {
		if (activeTeam === "alpha") {
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

	return (
		<div className="unit-selector">
			<div className="unit-selector__panel">
				<h1 className="unit-selector__title">Select Units</h1>
				<p className="unit-selector__subtitle">
					Player: <span className="unit-selector__name">{username}</span>
				</p>

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

				<div className="unit-selector__grid">
					{(activeTeam === "alpha" ? armyUnitsA : armyUnitsB).map((unit) => {
						const selectedIds =
							activeTeam === "alpha" ? selectedUnitIdsA : selectedUnitIdsB;
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
						disabled={selectedUnitIdsA.length === 0 || selectedUnitIdsB.length === 0}
						onClick={() =>
							navigate(`/${username}/army`, {
								state: {
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
