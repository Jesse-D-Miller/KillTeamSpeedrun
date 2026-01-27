function TopBar({ cp, vp, turningPoint, phase, initiativePlayerId }) {
  return (
    <header className="kt-topbar" data-testid="topbar">
      <div className="kt-topbar__item">
        <span className="kt-topbar__label">Phase</span>
        <span className="kt-topbar__value">{phase}</span>
      </div>
      <div className="kt-topbar__item">
        <span className="kt-topbar__label">Turning Point</span>
        <span className="kt-topbar__value">{turningPoint}</span>
      </div>
      <div className="kt-topbar__item">
        <span className="kt-topbar__label">Initiative</span>
        <span className="kt-topbar__value">
          {initiativePlayerId ? `Player ${initiativePlayerId}` : "—"}
        </span>
      </div>
      <div className="kt-topbar__item">
        <span className="kt-topbar__label">VP</span>
        <span className="kt-topbar__value">{vp}</span>
      </div>
      <div className="kt-topbar__item">
        <span className="kt-topbar__label">CP</span>
        <span className="kt-topbar__value" data-testid="cp-value">{cp}</span>
      </div>
    </header>
  );
}

export default TopBar;
