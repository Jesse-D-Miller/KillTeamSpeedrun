import { resolveAttack } from "../../engine/rules/resolveAttack";

function UnitCard({
  unit,
  dispatch,
  attackerId,
  defenderId,
  setAttackerId,
  setDefenderId,
  attacker,
  defender,
}) {
  if (!unit) return null;

  const { name, stats, state, weapons = [], rules = [], abilities = [] } = unit;

  const isInjured = state.woundsCurrent < stats.woundsMax / 2;

  const woundsPct = Math.round(
    stats.woundsMax === 0 ? 0 : (state.woundsCurrent / stats.woundsMax) * 100,
  );
  const safeWoundsPct = Math.max(0, Math.min(100, woundsPct));

  const selectedWeaponName =
    state.selectedWeapon || (weapons[0] ? weapons[0].name : "");

  const selectedWeapon =
    weapons.find((w) => w.name === selectedWeaponName) || weapons[0];

  return (
    <article className={`kt-card ${isInjured ? "kt-card--injured" : ""}`}>
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
            <div className="statbox__value">{stats.move}"</div>
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
          <span
            className={`pill ${state.order === "conceal" ? "pill--blue" : "pill--orange"}`}
          >
            {state.order.toUpperCase()}
          </span>
          {isInjured && <span className="pill pill--red">INJURED</span>}
        </div>

        <button
          className="btn btn--ghost"
          onClick={() =>
            dispatch({ type: "TOGGLE_ORDER", payload: { id: unit.id } })
          }
        >
          Toggle Order
        </button>
      </section>

      <button className="btn btn--ghost" onClick={() => setAttackerId(unit.id)}>
        {attackerId === unit.id ? "Attacker ✓" : "Set Attacker"}
      </button>

      <button className="btn btn--ghost" onClick={() => setDefenderId(unit.id)}>
        {defenderId === unit.id ? "Defender ✓" : "Set Defender"}
      </button>

      <button
        className="btn"
        disabled={!attacker || !defender || attacker.id !== unit.id}
        onClick={() => {
          const result = resolveAttack({
            attacker,
            defender,
            weapon: selectedWeapon,
            attackDice: [6, 5, 3, 1],
            defenseDice: [6, 6],
          });
          console.log(result);
        }}
      >
        Test Attack
      </button>

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
                  <td>{w.hit}+</td>
                  <td>{w.dmg}</td>
                  <td className="left">{w.wr}</td>
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
