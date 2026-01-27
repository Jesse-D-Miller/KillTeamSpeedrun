import "./UnitCard.css";
import { useState } from "react";
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
  onSelectWeapon = null,
  weaponSelectionEnabled = false,
  selectedWeaponNameOverride = null,
  autoSelectFirstWeapon = true,
  emptyWeaponsLabel = "No weapons",
  weaponOptionRole = null,
  weaponOptionTestIdPrefix = "weapon-option",
  className = "",
  weaponMode = null,
  collapsibleSections = false,
  showWoundsText = true,
  showInjuredInHeader = false,
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

  const [weaponsOpen, setWeaponsOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [abilitiesOpen, setAbilitiesOpen] = useState(false);

  const isUnitInjured = isInjured(unit);
  const baseMove = toNumber(stats.move);
  const effectiveMove = unitMove(unit);
  const moveDeltaClass = statDeltaClass(baseMove, effectiveMove);

  const woundsPct = Math.round(
    stats.woundsMax === 0 ? 0 : (state.woundsCurrent / stats.woundsMax) * 100,
  );
  const safeWoundsPct = Math.max(0, Math.min(100, woundsPct));
  const isDead = Number(state.woundsCurrent ?? 0) <= 0;

  const filteredWeapons = Array.isArray(weapons)
    ? weaponMode
      ? weapons.filter((w) => w?.mode === weaponMode)
      : weapons
    : [];

  const selectedWeaponNameRaw =
    selectedWeaponNameOverride !== null && selectedWeaponNameOverride !== undefined
      ? selectedWeaponNameOverride
      : state.selectedWeapon || "";
  const selectedWeaponName = selectedWeaponNameRaw
    ? filteredWeapons.find((w) => w.name === selectedWeaponNameRaw)?.name || ""
    : autoSelectFirstWeapon
      ? filteredWeapons[0]?.name || ""
      : "";

  const unitImage = resolveUnitImage(image);
  const readyState = unit.state?.readyState;
  const isActive =
    unit.id === activeOperativeId ||
    unit.state?.isActive === true ||
    readyState === "ACTIVE";
  const statusClass = isDead
    ? "dead"
    : isActive
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
      } ${isDead ? "kt-card--dead" : ""} ${className}`}
      onClick={handleCardClick}
      data-testid={`unit-card-${unit.id}`}
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
          {showInjuredInHeader && isUnitInjured && (
            <span className="pill pill--red">INJURED</span>
          )}
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
          {showWoundsText && (
            <span className="wounds__value">
              {state.woundsCurrent}/{stats.woundsMax}
            </span>
          )}
        </div>
      </div>
      
      <section className="kt-card__controls">
        {isDead && <span className="pill pill--red">DEAD</span>}
        {!isDead && !showInjuredInHeader && isUnitInjured && (
          <span className="pill pill--red">INJURED</span>
        )}
      </section>

      {/* Weapons table */}
      <section className="kt-card__section">
        {collapsibleSections ? (
          <>
            <button
              className="kt-card__section-toggle"
              type="button"
              onClick={() => setWeaponsOpen((prev) => !prev)}
              aria-expanded={weaponsOpen}
            >
              <span>Weapons</span>
              <span className="kt-card__section-caret">
                {weaponsOpen ? "▾" : "▸"}
              </span>
            </button>
            {weaponsOpen && (
              <>
                <div className="kt-card__sectionline" />
                {filteredWeapons.length === 0 ? (
                  <div className="kt-card__section-empty">{emptyWeaponsLabel}</div>
                ) : (
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
                      {filteredWeapons.map((w) => {
                        const isSelected = w.name === selectedWeaponName;
                        const canSelectWeapon =
                          Boolean(onSelectWeapon) && weaponSelectionEnabled;
                        const weaponTestId =
                          weaponOptionRole && weaponOptionTestIdPrefix
                            ? `${weaponOptionTestIdPrefix}-${weaponOptionRole}-${w.name}`
                            : undefined;

                        return (
                          <tr
                            key={w.name}
                            className={`kt-row ${
                              canSelectWeapon ? "kt-row--selectable" : ""
                            } ${isSelected ? "kt-row--selected" : ""}`}
                            data-testid={weaponTestId}
                            role={canSelectWeapon ? "button" : undefined}
                            tabIndex={canSelectWeapon ? 0 : undefined}
                            onClick={() => {
                              if (!canSelectWeapon) return;
                              onSelectWeapon?.(w.name);
                            }}
                            onKeyDown={(event) => {
                              if (!canSelectWeapon) return;
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                onSelectWeapon?.(w.name);
                              }
                            }}
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
                )}
              </>
            )}
          </>
          ) : (
            <>
              <div className="kt-card__sectionline" />
              {filteredWeapons.length === 0 ? (
                <div className="kt-card__section-empty">{emptyWeaponsLabel}</div>
              ) : (
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
                    {filteredWeapons.map((w) => {
                      const isSelected = w.name === selectedWeaponName;
                      const canSelectWeapon =
                        Boolean(onSelectWeapon) && weaponSelectionEnabled;
                      const weaponTestId =
                        weaponOptionRole && weaponOptionTestIdPrefix
                          ? `${weaponOptionTestIdPrefix}-${weaponOptionRole}-${w.name}`
                          : undefined;

                      return (
                        <tr
                          key={w.name}
                          className={`kt-row ${
                            canSelectWeapon ? "kt-row--selectable" : ""
                          } ${isSelected ? "kt-row--selected" : ""}`}
                          data-testid={weaponTestId}
                          role={canSelectWeapon ? "button" : undefined}
                          tabIndex={canSelectWeapon ? 0 : undefined}
                          onClick={() => {
                            if (!canSelectWeapon) return;
                            onSelectWeapon?.(w.name);
                          }}
                          onKeyDown={(event) => {
                            if (!canSelectWeapon) return;
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              onSelectWeapon?.(w.name);
                            }
                          }}
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
              )}
            </>
        )}
      </section>

      {/* Rules */}
      {rules.length > 0 && (
        <section className="kt-card__section kt-card__rules">
          {collapsibleSections ? (
            <>
              <button
                className="kt-card__section-toggle"
                type="button"
                onClick={() => setRulesOpen((prev) => !prev)}
                aria-expanded={rulesOpen}
              >
                <span>Rules</span>
                <span className="kt-card__section-caret">
                  {rulesOpen ? "▾" : "▸"}
                </span>
              </button>
              {rulesOpen && (
                <div className="kt-card__section-body">
                  {rules.map((r) => (
                    <p key={r.name} className="ruleline">
                      <span className="ruleline__name">{r.name}:</span> {r.text}
                    </p>
                  ))}
                </div>
              )}
            </>
          ) : (
            rules.map((r) => (
              <p key={r.name} className="ruleline">
                <span className="ruleline__name">{r.name}:</span> {r.text}
              </p>
            ))
          )}
        </section>
      )}

      {/* Abilities */}
      {abilities.length > 0 && (
        <section className="kt-card__section kt-card__abilities">
          {collapsibleSections ? (
            <>
              <button
                className="kt-card__section-toggle"
                type="button"
                onClick={() => setAbilitiesOpen((prev) => !prev)}
                aria-expanded={abilitiesOpen}
              >
                <span>Abilities</span>
                <span className="kt-card__section-caret">
                  {abilitiesOpen ? "▾" : "▸"}
                </span>
              </button>
              {abilitiesOpen && (
                <div className="kt-card__section-body">
                  {abilities.map((a) => (
                    <section key={a.name} className="kt-card__ability">
                      <div className="ability__bar">
                        <div className="ability__name">{a.name}</div>
                        <div className="ability__cost">{a.cost}AP</div>
                      </div>
                      {a.text && <div className="ability__text">{a.text}</div>}
                    </section>
                  ))}
                </div>
              )}
            </>
          ) : (
            abilities.map((a) => (
              <section key={a.name} className="kt-card__ability">
                <div className="ability__bar">
                  <div className="ability__name">{a.name}</div>
                  <div className="ability__cost">{a.cost}AP</div>
                </div>
                {a.text && <div className="ability__text">{a.text}</div>}
              </section>
            ))
          )}
        </section>
      )}
    </article>
  );
}

export default UnitCard;
