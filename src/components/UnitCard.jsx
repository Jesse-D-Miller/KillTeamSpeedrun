function UnitCard({ unit, dispatch }) {
  if (!unit) {
    return null;
  }

  const { name, stats, state } = unit;
  return (
    <div className="unit-card">
      <h2>{name}</h2>
      <p>APL: {stats.apl}</p>
      <p>Move: {stats.move}</p>
      <p>Save: {stats.save}+</p>
      <p>
        Wounds: {state.woundsCurrent}/{stats.woundsMax}
      </p>
      <div className="controls">
        <button
          onClick={() =>
            dispatch({
              type: "DAMAGE_UNIT",
              payload: { id: unit.id, amount: 1 },
            })
          }
        >
          -1 Wound
        </button>

        <button
          onClick={() =>
            dispatch({
              type: "HEAL_UNIT",
              payload: { id: unit.id, amount: 1 },
            })
          }
        >
          +1 Wound
        </button>

        <button
          onClick={() =>
            dispatch({
              type: "TOGGLE_INJURED",
              payload: { id: unit.id },
            })
          }
        >
          {state.injured ? "Clear Injured" : "Set Injured"}
        </button>

        <button
          onClick={() =>
            dispatch({
              type: "TOGGLE_ORDER",
              payload: { id: unit.id },
            })
          }
        >
          Order: {state.order}
        </button>
      </div>
    </div>
  );
}

export default UnitCard;
