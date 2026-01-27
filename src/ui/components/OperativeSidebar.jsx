import "./OperativeSidebar.css";

function OperativeSidebar({ unit }) {
  if (!unit) return null;

  return (
    <div className="operative-sidebar">
      <div className="operative-sidebar__block">KDR</div>
      <div className="operative-sidebar__block">BATTLES</div>
      <div className="operative-sidebar__block">POINTS</div>
      <div className="operative-sidebar__block">Backstory</div>
      <div className="operative-sidebar__block">Flavor text</div>
    </div>
  );
}

export default OperativeSidebar;
