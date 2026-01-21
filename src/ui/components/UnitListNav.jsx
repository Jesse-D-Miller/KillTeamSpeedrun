import "./UnitListNav.css";
import { isInjured, unitMove } from "../../engine/selectors/unitSelectors";

function UnitListNav({ units, selectedUnitId, onSelectUnit }) {
	return (
		<div className="kt-nav__list">
			{units.map((unit) => {
					const isSelected = unit.id === selectedUnitId;
					const woundsPct =
						unit.stats.woundsMax === 0
							? 0
							: Math.round(
									(unit.state.woundsCurrent / unit.stats.woundsMax) * 100,
								);

					const safePct = Math.max(0, Math.min(100, woundsPct));
					const unitIsInjured = isInjured(unit);
					const effectiveMove = unitMove(unit) ?? unit.stats.move;

					return (
						<button
							key={unit.id}
							className={`kt-navitem ${isSelected ? "kt-navitem--selected" : ""} ${unitIsInjured ? "kt-navitem--injured" : ""}`}
							onClick={() => onSelectUnit(unit.id)}
							type="button"
						>
							<div className="kt-navitem__top">
								<div className="kt-navitem__name">{unit.name}</div>

								<div className="kt-navitem__tags">
									<span
										className={`kt-chip ${
											unit.state.order === "conceal"
												? "kt-chip--blue"
												: "kt-chip--orange"
										}`}
									>
										{unit.state.order}
									</span>

									{unitIsInjured && (
										<span className="kt-chip kt-chip--red">inj</span>
									)}
								</div>
							</div>

							<div className="kt-navitem__stats">
								<span className="kt-mini">
									APL <b>{unit.stats.apl}</b>
								</span>
								<span className="kt-mini">
									M <b>{effectiveMove}"</b>
								</span>
								<span className="kt-mini">
									SV <b>{unit.stats.save}+</b>
								</span>
								<span className="kt-mini">
									W <b>{unit.state.woundsCurrent}</b>/<b>{unit.stats.woundsMax}</b>
								</span>
							</div>

							<div className="kt-navitem__bar">
								<div
									className={`kt-navitem__fill ${unitIsInjured ? "kt-navitem__fill--injured" : ""}`}
									style={{ width: `${safePct}%` }}
								/>
							</div>
						</button>
					);
				})}
		</div>
	);
}

export default UnitListNav;
