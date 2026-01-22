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
  onLog,
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

  const { name, stats, state, weapons = [], rules = [], abilities = [] } = unit;

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

  return (
    <article className={`kt-card ${isUnitInjured ? "kt-card--injured" : ""}`}>
      {/* Header */}
      <header className="kt-card__header">
        <div className="kt-card__title">
          <div className="kt-card__name">{name.toUpperCase()}</div>
        </div>

        <div className="kt-card__stats">
          <div className="statbox">
            <div className="statbox__label">APL</div>
            <div className="statbox__value">{stats.apl}</div>
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
      </header>

      {/* Wounds bar */}
      <div className="wounds">
        <div className="wounds__top">
          <span className="wounds__label">Wounds</span>
          <span className="wounds__value">
            {state.woundsCurrent}/{stats.woundsMax}
          </span>
        </div>

        <div className="wounds__bar">
          <div
            className="wounds__fill"
            style={{ width: `${safeWoundsPct}%` }}
          />
        </div>
      </div>

      {/* Wounds controls */}
      <section className="kt-card__controls">
        <button
          className="btn"
          onClick={() =>
            dispatch({
              type: "DAMAGE_UNIT",
              payload: { id: unit.id, amount: 1 },
            })
          }
        >
          -1
        </button>
        <button
          className="btn"
          onClick={() =>
            dispatch({ type: "HEAL_UNIT", payload: { id: unit.id, amount: 1 } })
          }
        >
          +1
        </button>

        <div className="kt-card__status">
          <button
            className={`pill pill--clickable ${
              state.order === "conceal" ? "pill--blue" : "pill--orange"
            }`}
            type="button"
            onClick={() =>
              dispatch({
                type: "SET_ORDER_OVERRIDE",
                payload: {
                  id: unit.id,
                  order: state.order === "conceal" ? "engage" : "conceal",
                },
              })
            }
          >
            {state.order.toUpperCase()}
          </button>
          {isUnitInjured && <span className="pill pill--red">INJURED</span>}
        </div>
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
                  onClick={() =>
                    dispatch({
                      type: "SET_SELECTED_WEAPON",
                      payload: { id: unit.id, weaponName: w.name },
                    })
                  }
                  role="button"
                  tabIndex={0}
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
                      <td className={hitDeltaClass}>
                        {effectiveHit ?? w.hit}+
                      </td>
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
