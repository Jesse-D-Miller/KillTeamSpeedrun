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
	const selectedArmyKey = location.state?.armyKey;

	const armyUnits = useMemo(() => {
		const entry = Object.entries(killteamModules).find(([path]) =>
			path.includes(`${selectedArmyKey}.json`),
		);
		if (!entry) return [];
		return normalizeKillteamData(entry[1]);
	}, [selectedArmyKey]);

	const [selectedUnitIds, setSelectedUnitIds] = useState(
		armyUnits.map((unit) => unit.id),
	);

	const toggleUnit = (unitId) => {
		setSelectedUnitIds((prev) =>
			prev.includes(unitId)
				? prev.filter((id) => id !== unitId)
				: [...prev, unitId],
		);
	};

	return (
		<div className="unit-selector">
			<div className="unit-selector__panel">
				<h1 className="unit-selector__title">Select Units</h1>
				<p className="unit-selector__subtitle">
					Player: <span className="unit-selector__name">{username}</span>
				</p>

				<div className="unit-selector__grid">
					{armyUnits.map((unit) => {
						const isSelected = selectedUnitIds.includes(unit.id);
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
						disabled={selectedUnitIds.length === 0}
						onClick={() =>
							navigate(`/${username}/army`, {
								state: {
									armyKey: selectedArmyKey,
									selectedUnitIds,
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
