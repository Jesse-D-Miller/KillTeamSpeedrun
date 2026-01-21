function UnitCard({ unit }) {
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
      <p>Wounds: {state.woundsCurrent}/{stats.woundsMax}</p>
    </div>
  );
}

export default UnitCard;