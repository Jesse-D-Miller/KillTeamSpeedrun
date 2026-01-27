import "./UnitCard.css";
import {
  isInjured,
  statDeltaClass,
  statDeltaClassLowerIsBetter,
  unitMove,
  weaponHit,
} from "../../engine/selectors/unitSelectors";

function UnitCard({
  unit,
  dispatch,
  canChooseOrder = false,
  onChooseOrder = null,
  activeOperativeId = null,
  onCardClick = null,
}) {
  if (!unit) return null;

  const normalizeWeaponRules = (wr) => {
    if (!wr || wr === "-") return [];
    return Array.isArray(wr) ? wr : [wr];
  };

  const formatWeaponRules = (wr) => {
    const list = normalizeWeaponRules(wr)
      .map((rule) => {
        if (!rule) return "";
        if (typeof rule === "string") return rule;
        const id = rule.id || "";
        const value =
          rule.value !== undefined && rule.value !== null ? ` ${rule.value}` : "";
        const note = rule.note ? ` (${rule.note})` : "";
        return `${id}${value}${note}`.trim();
      })
      .filter(Boolean);
    return list.length ? list.join(", ") : "-";
  };

  const toNumber = (value) => {
    const parsed = Number(String(value).replace("+", ""));
    return Number.isNaN(parsed) ? null : parsed;
  };

  const resolveUnitImage = (image) => {
    if (!image) return null;
    if (typeof image !== "string") return null;
    if (image.startsWith("http://") || image.startsWith("https://")) return image;
    if (image.startsWith("/")) return image;
    if (image.startsWith("public/")) return `/${image.slice("public/".length)}`;
    return `/${image}`;
  };

  const { name, stats, state, weapons = [], rules = [], abilities = [], image } = unit;

  const isUnitInjured = isInjured(unit);
  const baseMove = toNumber(stats.move);
  const effectiveMove = unitMove(unit);
  const moveDeltaClass = statDeltaClass(baseMove, effectiveMove);

  const woundsPct = Math.round(
    stats.woundsMax === 0 ? 0 : (state.woundsCurrent / stats.woundsMax) * 100,
  );
  const safeWoundsPct = Math.max(0, Math.min(100, woundsPct));

  const selectedWeaponName =
    state.selectedWeapon || (weapons[0] ? weapons[0].name : "");

  const selectedWeapon =
    weapons.find((w) => w.name === selectedWeaponName) || weapons[0];

  const unitImage = resolveUnitImage(image);
  const readyState = unit.state?.readyState;
  const isActive =
    unit.id === activeOperativeId ||
    unit.state?.isActive === true ||
    readyState === "ACTIVE";
  const statusClass = isActive
    ? "active"
    : readyState === "EXPENDED"
      ? "expended"
      : readyState === "READY"
        ? "ready"
        : "idle";

  const handleCardClick = (event) => {
    if (!onCardClick) return;
    if (event.defaultPrevented) return;
    const interactive = event.target.closest(
      "button, a, input, select, textarea, [role='button']",
    );
    if (interactive) return;
    onCardClick(unit);
  };

  return (
    <article
      className={`kt-card ${isUnitInjured ? "kt-card--injured" : ""} ${
        onCardClick ? "kt-card--clickable" : ""
      }`}
      onClick={handleCardClick}
    >
      {/* Header */}
      <header className="kt-card__header">
        <div className="kt-card__title">
          <div className="kt-card__portrait">
            {unitImage ? (
              <img
                className="kt-card__portrait-img"
                src={unitImage}
                alt={name}
                loading="lazy"
              />
            ) : (
              <div className="kt-card__portrait-fallback" aria-hidden="true" />
            )}

            <div className="kt-card__namebar">
              <div className="kt-card__name">{name.toUpperCase()}</div>
            </div>
          </div>
        </div>

        <div className="kt-card__stats">
          <div className="statbox">
            <div className="statbox__label">APL</div>
            <div className="statbox__value">
              {Number.isFinite(Number(state.apCurrent))
                ? Number(state.apCurrent)
                : stats.apl}
              /{stats.apl}
            </div>
          </div>
          <div className="statbox">
            <div className="statbox__label">MOVE</div>
            <div className={`statbox__value ${moveDeltaClass}`}>
              {effectiveMove ?? stats.move}"
            </div>
          </div>
          <div className="statbox">
            <div className="statbox__label">SAVE</div>
            <div className="statbox__value">{stats.save}+</div>
          </div>
          <div className="statbox">
            <div className="statbox__label">WOUNDS</div>
            <div className="statbox__value">{state.woundsCurrent}</div>
            <div className="statbox__sub">/ {stats.woundsMax}</div>
          </div>
        </div>
        <div className="kt-dark-header-meta">
          <button
            className={`pill pill--clickable ${
              state.order === "conceal" ? "pill--blue" : "pill--orange"
            }`}
            type="button"
            onClick={() => {
              const nextOrder = state.order === "conceal" ? "engage" : "conceal";
              if (canChooseOrder && typeof onChooseOrder === "function") {
                onChooseOrder(nextOrder);
                return;
              }
              dispatch({
                type: "SET_ORDER_OVERRIDE",
                payload: {
                  id: unit.id,
                  order: nextOrder,
                },
              });
            }}
            disabled={Boolean(onChooseOrder) && !canChooseOrder}
          >
            {state.order.toUpperCase()}
          </button>
          <span className={`kt-dark-status-light kt-dark-status-light--${statusClass}`} />
        </div>
      </header>

      {/* Wounds bar */}
      <div className="wounds">
        <div className="wounds__bar">
          <div className="wounds__fill" style={{ width: `${safeWoundsPct}%` }} />
          <span className="wounds__value">
            {state.woundsCurrent}/{stats.woundsMax}
          </span>
        </div>
      </div>
      
      <section className="kt-card__controls">
        {isUnitInjured && <span className="pill pill--red">INJURED</span>}
      </section>

      {/* Weapons table */}
      <section className="kt-card__section">
        <div className="kt-card__sectionline" />
        <table className="kt-table">
          <thead>
            <tr>
              <th className="left">NAME</th>
              <th>ATK</th>
              <th>HIT</th>
              <th>DMG</th>
              <th className="left">WR</th>
            </tr>
          </thead>
          <tbody>
            {weapons.map((w) => {
              const isSelected = w.name === selectedWeaponName;

              return (
                <tr
                  key={w.name}
                  className={`kt-row ${isSelected ? "kt-row--selected" : ""}`}
                >
                  <td className="left">{w.name}</td>
                  <td>{w.atk}</td>
                  {(() => {
                    const effectiveHit = weaponHit(w, unit);
                    const baseHit = toNumber(w.hit);
                    const hitDeltaClass = statDeltaClassLowerIsBetter(
                      baseHit,
                      effectiveHit,
                    );
                    return (
                      <td className={hitDeltaClass}>{effectiveHit ?? w.hit}+</td>
                    );
                  })()}
                  <td>{w.dmg}</td>
                  <td className="left">{formatWeaponRules(w.wr)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* Rules */}
      {rules.length > 0 && (
        <section className="kt-card__section kt-card__rules">
          {rules.map((r) => (
            <p key={r.name} className="ruleline">
              <span className="ruleline__name">{r.name}:</span> {r.text}
            </p>
          ))}
        </section>
      )}

      {/* Abilities */}
      {abilities.map((a) => (
        <section key={a.name} className="kt-card__ability">
          <div className="ability__bar">
            <div className="ability__name">{a.name}</div>
            <div className="ability__cost">{a.cost}AP</div>
          </div>
          {a.text && <div className="ability__text">{a.text}</div>}
        </section>
      ))}
    </article>
  );
}

export default UnitCard;
