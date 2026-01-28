// AttackResolutionScreen.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import "./AttackResolutionScreen.css";
import UnitCard from "../components/UnitCard";
import WeaponRulesPanel from "../components/WeaponRulesPanel";
import { normalizeWeaponRules } from "../../engine/rules/weaponRules";
import { allocateDefense } from "../../engine/rules/resolveDice";

// Load all faction firefight ploys (eager so it works in UI immediately)
const firefightPloyModules = import.meta.glob(
  "../../data/killteams/**/**/*FirefightPloys.json",
  { eager: true },
);

const PHASES = {
  PRE_ROLL: "PRE_ROLL",
  ROLL: "ROLL",
  POST_ROLL: "POST_ROLL",
  RESOLVED: "RESOLVED",
};

const clampInt = (value, min, max) => {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(max, Math.max(min, parsed));
};

const normKey = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

function normalizeDataset(mod) {
  if (!mod) return null;
  const data = mod.default ?? mod;
  if (!data?.ploys) return null;
  return data;
}

function getKillTeamHint(attacker, defender) {
  const candidates = [
    attacker?.killTeam,
    attacker?.killTeamName,
    attacker?.faction,
    attacker?.teamName,
    attacker?.meta?.killTeam,
    defender?.killTeam,
    defender?.killTeamName,
    defender?.faction,
    defender?.teamName,
    defender?.meta?.killTeam,
  ].filter(Boolean);
  return candidates[0] || "";
}

function computeDamagePreview({
  weapon,
  attackHits,
  attackCrits,
  defenseHits,
  defenseCrits,
}) {
  const [normalDmg, critDmg] = String(weapon?.dmg || "0/0")
    .split("/")
    .map((v) => Number(v));

  const normalDamage = Number.isFinite(normalDmg) ? normalDmg : 0;
  const critDamage = Number.isFinite(critDmg) ? critDmg : 0;

  const allocation = allocateDefense({
    attackHits,
    attackCrits,
    defenseHits,
    defenseCrits,
    normalDamage,
    critDamage,
  });

  const totalDamage =
    allocation.remainingHits * normalDamage +
    allocation.remainingCrits * critDamage;

  return {
    normalDamage,
    critDamage,
    remainingHits: allocation.remainingHits,
    remainingCrits: allocation.remainingCrits,
    totalDamage,
  };
}

/**
 * Counter input: typing (no clamp per keystroke) + +/- buttons.
 * Clamp on blur and on +/-.
 */
function CountInput({ label, value, max, min = 0, onChange, disabled, testId }) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = (next) => {
    const safe = clampInt(next, min, max);
    onChange(safe);
    setDraft(String(safe));
  };

  const onType = (e) => {
    const next = e.target.value;
    if (next === "" || /^-?\d+$/.test(next)) setDraft(next);
  };

  const onBlur = () => {
    if (draft === "") return commit(min);
    commit(draft);
  };

  return (
    <div className="attack-resolution__count">
      <div className="attack-resolution__label">{label}</div>
      <div className="attack-resolution__count-row">
        <button
          type="button"
          className="attack-resolution__count-btn"
          aria-label={`${label} minus`}
          onClick={() => commit((Number(value) || 0) - 1)}
          disabled={disabled || (Number(value) || 0) <= min}
        >
          −
        </button>

        <input
          className="attack-resolution__input attack-resolution__count-input"
          inputMode="numeric"
          value={draft}
          onChange={onType}
          onBlur={onBlur}
          aria-label={label}
          data-testid={testId}
          disabled={disabled}
        />

        <button
          type="button"
          className="attack-resolution__count-btn"
          aria-label={`${label} plus`}
          onClick={() => commit((Number(value) || 0) + 1)}
          disabled={disabled || (Number(value) || 0) >= max}
        >
          +
        </button>
      </div>

      <div className="attack-resolution__count-hint">0–{max}</div>
    </div>
  );
}

function AttackResolutionScreen({
  open,
  role,
  attacker,
  defender,
  weapon,
  combatStage,
  attackRoll,
  defenseRoll,
  rollsLocked: rollsLockedFromState,
  attackLocked,
  defenseLocked,
  attackDiceCount,
  defenseDiceCount,
  onSetAttackRoll,
  onLockAttack,
  onSetDefenseRoll,
  onLockDefense,
  onApplyDamage,
  onResolveComplete,
  onCancel,
}) {
  const [phase, setPhase] = useState(PHASES.PRE_ROLL);
  const [combatCtx, setCombatCtx] = useState(() => ({
    phase: PHASES.PRE_ROLL,
    ui: { prompts: [], notes: [] },
    log: [],
    modifiers: {},
    weaponRules: [],
    attackDice: [],
  }));

  // Final-entry (attacker only; ignores defender blocks)
  const [finalAttackHits, setFinalAttackHits] = useState(0);
  const [finalAttackCrits, setFinalAttackCrits] = useState(0);

  const [usedRules, setUsedRules] = useState({});
  const [preRollFlags, setPreRollFlags] = useState({
    cover: false,
    obscured: false,
    vantage: false,
  });

  const [rollsLocked, setRollsLocked] = useState(false);

  const [logs, setLogs] = useState([]);
  const logIdRef = useRef(0);

  const isFight =
    weapon?.mode === "melee" ||
    String(combatStage || "").toLowerCase().includes("fight");

  const attackerSuccessThreshold = Number(weapon?.hit ?? 6);
  const defenderSuccessThreshold = isFight
    ? Number(
        defender?.state?.selectedWeaponHit ??
          defender?.meleeHit ??
          weapon?.hit ??
          6,
      )
    : Number(defender?.stats?.save ?? 6);

  const maxAttackDice = Math.max(0, Number(attackDiceCount || 0));
  const maxDefenseDice = Math.max(0, Number(defenseDiceCount || 0));

  const isAttackerRole = role === "attacker";
  const isDefenderRole = role === "defender";
  const attackerReady = Boolean(rollsLocked || attackLocked);
  const defenderReady = Boolean(rollsLocked || defenseLocked);
  const youReady = isAttackerRole ? attackerReady : isDefenderRole ? defenderReady : false;
  const opponentReady = isAttackerRole
    ? defenderReady
    : isDefenderRole
      ? attackerReady
      : false;

  const addLog = (group, message) => {
    logIdRef.current += 1;
    const entry = { id: logIdRef.current, group, message, ts: Date.now() };
    setLogs((prev) => [entry, ...prev]); // newest first
  };

  useEffect(() => {
    if (!open) return;

    setUsedRules({});
    setLogs([]);

    setFinalAttackHits(0);
    setFinalAttackCrits(0);

    setPreRollFlags({ cover: false, obscured: false, vantage: false });
    setRollsLocked(Boolean(rollsLockedFromState));

    // Keep this simple: both players start on PRE_ROLL visually.
    // Your multiplayer stage can still exist; we just aren't gatekeeping UI anymore.
    setPhase(PHASES.PRE_ROLL);
  }, [open, role, combatStage, rollsLockedFromState]);

  useEffect(() => {
    if (!open) return;
    const e2eOverrideRules =
      typeof window !== "undefined" && Array.isArray(window.__ktE2E_weaponRules)
        ? window.__ktE2E_weaponRules
        : null;
    const e2eOverrides =
      typeof window !== "undefined" && window.__ktE2E_combatCtxOverrides
        ? window.__ktE2E_combatCtxOverrides
        : null;
    const normalizedRules = e2eOverrideRules
      ? normalizeWeaponRules({ wr: e2eOverrideRules })
      : weapon
        ? normalizeWeaponRules(weapon)
        : [];
    const normalizedAttackDice = Array.isArray(attackRoll)
      ? attackRoll.map((value) => ({ value: Number(value), tags: [] }))
      : [];
    setCombatCtx((prev) => ({
      ...prev,
      phase,
      weaponRules: normalizedRules,
      attackDice: Array.isArray(e2eOverrides?.attackDice)
        ? e2eOverrides.attackDice
        : normalizedAttackDice,
      inputs: { ...(prev.inputs || {}), ...(e2eOverrides?.inputs || {}) },
      modifiers: { ...(prev.modifiers || {}), ...(e2eOverrides?.modifiers || {}) },
      ui: prev.ui || { prompts: [], notes: [] },
      log: prev.log || [],
    }));
  }, [open, phase, weapon, attackRoll]);

  useEffect(() => {
    if (!open) return;
    if (typeof rollsLockedFromState !== "boolean") return;
    setRollsLocked(rollsLockedFromState);
  }, [open, rollsLockedFromState]);

  useEffect(() => {
    if (!open) return;
    if (rollsLocked) {
      setPhase(PHASES.POST_ROLL);
    }
  }, [open, rollsLocked]);

  // Weapon rules buckets
  const rules = useMemo(() => {
    if (!weapon) return [];
    return normalizeWeaponRules(weapon).map((rule) => {
      const timing = ["accurate"].includes(rule.id) ? "PRE_ROLL" : "POST_ROLL";
      return { ...rule, timing };
    });
  }, [weapon]);

  const preRollActions = rules.filter((r) => r.timing === "PRE_ROLL");
  const postRollActions = rules.filter((r) => {
    if (r.timing !== "POST_ROLL") return false;
    const id = String(r.id || "").toLowerCase();
    return id !== "range" && !id.startsWith("range");
  });

  // Firefight ploys dataset selection
  const firefightPloys = useMemo(() => {
    const datasets = Object.values(firefightPloyModules)
      .map(normalizeDataset)
      .filter(Boolean);

    if (datasets.length === 0) return { label: "No ploys found", ploys: [] };

    const hint = getKillTeamHint(attacker, defender);
    const target = normKey(hint);

    const exact = datasets.find((d) => normKey(d.killTeam) === target);
    const fallback = exact || datasets[0];

    return {
      label: fallback?.killTeam
        ? `${fallback.killTeam} Firefight Ploys`
        : "Firefight Ploys",
      ploys: Array.isArray(fallback?.ploys) ? fallback.ploys : [],
    };
  }, [attacker, defender]);

  const markPostRollRuleUsed = (ruleId, label) => {
    if (usedRules[ruleId]) return;
    if (!rollsLocked) return;
    setUsedRules((prev) => ({ ...prev, [ruleId]: true }));
    addLog("Post-Roll", `${label} applied.`);
  };

  // Final entry ignores defender blocks
  const finalPreview = useMemo(() => {
    return computeDamagePreview({
      weapon,
      attackHits: finalAttackHits,
      attackCrits: finalAttackCrits,
      defenseHits: 0,
      defenseCrits: 0,
    });
  }, [weapon, finalAttackHits, finalAttackCrits]);

  const resolveFromFinalWindow = () => {
    addLog(
      "Damage",
      `Final: hits ${finalAttackHits}, crits ${finalAttackCrits}. Total damage ${finalPreview.totalDamage}.`,
    );

    if (defender?.id && finalPreview.totalDamage > 0) {
      onApplyDamage?.(defender.id, finalPreview.totalDamage);
    }

    onResolveComplete?.();
    setPhase(PHASES.RESOLVED);
  };

  if (!open || !attacker || !defender || !weapon) return null;

  const defenderSuccessLabel = isFight ? "HIT" : "SAVE";
  const defenderCritLabel = isFight ? "CRIT" : "CRIT SAVE";
  const defenderRollLabel = isFight ? "Hits" : "Saves";
  const defenderCritRollLabel = isFight ? "Crits" : "Crit Saves";

  return (
    <div className="kt-modal" data-testid="attack-resolution-modal">
      <div className="kt-modal__backdrop" onClick={() => onCancel?.()} />
      <div className="kt-modal__panel attack-resolution__modal-panel">
        <button
          className="kt-modal__close"
          type="button"
          onClick={() => onCancel?.()}
          aria-label="Dismiss modal"
          title="Dismiss modal"
        >
          ×
        </button>

        <div className="attack-resolution">
          {/* LEFT: Battle Log */}
          <aside className="attack-resolution__log">
            <div className="attack-resolution__log-title">Battle Log</div>
            <div className="attack-resolution__log-list">
              {logs.length === 0 && (
                <div className="attack-resolution__log-empty">No entries yet.</div>
              )}
              {logs.map((entry) => (
                <div key={entry.id} className="attack-resolution__log-entry">
                  <span className="attack-resolution__log-group">
                    {entry.group}
                  </span>
                  <span>{entry.message}</span>
                </div>
              ))}
            </div>
          </aside>

          {/* RIGHT: Main */}
          <section className="attack-resolution__main">
            {/* Header cards */}
            <div className="attack-resolution__header">
              <UnitCard
                unit={attacker}
                dispatch={() => {}}
                canChooseOrder={false}
                onChooseOrder={() => {}}
                className="attack-resolution__unit-card"
                weaponMode={weapon?.mode ?? null}
                selectedWeaponNameOverride={weapon?.name ?? null}
                autoSelectFirstWeapon={false}
                collapsibleSections={true}
                showWoundsText={false}
                showInjuredInHeader={true}
              />
              <UnitCard
                unit={defender}
                dispatch={() => {}}
                canChooseOrder={false}
                onChooseOrder={() => {}}
                className="attack-resolution__unit-card"
                weaponMode={weapon?.mode ?? null}
                selectedWeaponNameOverride={weapon?.name ?? null}
                autoSelectFirstWeapon={false}
                collapsibleSections={true}
                showWoundsText={false}
                showInjuredInHeader={true}
              />
            </div>

            {/* Summary */}
            <div className="attack-resolution__summary-row">
              <div className="attack-resolution__summary-col">
                <span>ATK {maxAttackDice}</span>
                <span>HIT {attackerSuccessThreshold}+</span>
                <span>CRIT 6+</span>
              </div>
              <div className="attack-resolution__summary-col">
                <span>
                  {defenderSuccessLabel} {defenderSuccessThreshold}+
                </span>
                <span>{defenderCritLabel} 6+</span>
              </div>
            </div>

            {/* Pre-roll */}
            <div className="attack-resolution__panel">
              <div className="attack-resolution__section">
                <div className="attack-resolution__section-title">Pre-Roll</div>

                <div className="attack-resolution__checkboxes">
                  {role === "attacker" && (
                    <label className="attack-resolution__checkbox">
                      <input
                        type="checkbox"
                        checked={preRollFlags.vantage}
                        onChange={(event) => {
                          const next = event.target.checked;
                          setPreRollFlags((prev) => ({ ...prev, vantage: next }));
                          addLog(
                            "Pre-Roll",
                            `Vantage ${next ? "enabled" : "cleared"}.`,
                          );
                        }}
                      />
                      Vantage
                    </label>
                  )}

                  {role === "defender" && (
                    <>
                      <label className="attack-resolution__checkbox">
                        <input
                          type="checkbox"
                          checked={preRollFlags.cover}
                          onChange={(event) => {
                            const next = event.target.checked;
                            setPreRollFlags((prev) => ({ ...prev, cover: next }));
                            addLog(
                              "Pre-Roll",
                              `Cover ${next ? "enabled" : "cleared"}.`,
                            );
                          }}
                        />
                        Cover
                      </label>

                      <label className="attack-resolution__checkbox">
                        <input
                          type="checkbox"
                          checked={preRollFlags.obscured}
                          onChange={(event) => {
                            const next = event.target.checked;
                            setPreRollFlags((prev) => ({
                              ...prev,
                              obscured: next,
                            }));
                            addLog(
                              "Pre-Roll",
                              `Obscured ${next ? "enabled" : "cleared"}.`,
                            );
                          }}
                        />
                        Obscured
                      </label>
                    </>
                  )}
                </div>

                <div className="attack-resolution__rules">
                  {role !== "attacker" ? (
                    <div className="attack-resolution__empty">
                      No pre-roll rules for defender yet.
                    </div>
                  ) : (
                    <WeaponRulesPanel
                      ctx={combatCtx}
                      phase={PHASES.PRE_ROLL}
                      onCtxChange={setCombatCtx}
                      testId={undefined}
                    />
                  )}
                </div>

                <div className="attack-resolution__dice-strip">
                  <div className="attack-resolution__dice-line">
                    <strong>Attacker:</strong>&nbsp;Roll {maxAttackDice} · success
                    on {attackerSuccessThreshold}+ · crit on 6+
                  </div>
                  <div className="attack-resolution__dice-line">
                    <strong>Defender:</strong>&nbsp;Roll {maxDefenseDice} · success
                    on {defenderSuccessThreshold}+ · crit on 6+
                  </div>
                </div>

              </div>
            </div>

            {/* Roll section (centered; attacker row then defender row) */}
            <div className="attack-resolution__panel">
              <div className="attack-resolution__section">
                <div className="attack-resolution__section-title">Roll</div>

                <div className="attack-resolution__instruction" data-testid="roll-instructions">
                  <div className="attack-resolution__instruction-title">
                    Roll your dice now
                  </div>
                  <div className="attack-resolution__instruction-line">
                    <strong>Attacker:</strong> Roll {maxAttackDice} · success on
                    {" "}{attackerSuccessThreshold}+ · crit on 6+
                  </div>
                  <div className="attack-resolution__instruction-line">
                    <strong>Defender:</strong> Roll {maxDefenseDice} · success on
                    {" "}{defenderSuccessThreshold}+ · crit on 6+
                  </div>

                </div>

                {role !== "attacker" ? (
                  <div className="attack-resolution__empty">
                    (Attacker-only for now — defender rules not wired yet.)
                  </div>
                ) : (
                  <div className="attack-resolution__postroll">
                    <WeaponRulesPanel
                      ctx={combatCtx}
                      phase={PHASES.ROLL}
                      onCtxChange={setCombatCtx}
                      testId="weapon-rules-panel"
                    />
                  </div>
                )}

                {role !== "attacker" ? null : (
                  <div className="attack-resolution__postroll">
                    {!rollsLocked ? (
                      <div className="attack-resolution__empty">
                        Lock rolls first to use post-roll rules.
                      </div>
                    ) : null}

                    <WeaponRulesPanel
                      ctx={combatCtx}
                      phase={PHASES.POST_ROLL}
                      onCtxChange={setCombatCtx}
                      testId={undefined}
                    />
                    <button
                      className="attack-resolution__rule attack-resolution__rule--secondary"
                      type="button"
                      onClick={() => addLog("Post-Roll", "CP re-roll used (placeholder).")}
                      disabled={!rollsLocked}
                      title={!rollsLocked ? "Lock rolls first" : undefined}
                    >
                      CP Re-roll
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Final entry (attacker only; ignores defender blocks) */}
            <div className="attack-resolution__panel">
              <div className="attack-resolution__section">
                <div className="attack-resolution__section-title">Final Entry</div>

                <div className="attack-resolution__roll-grid">
                  <div className="attack-resolution__roll-row attack-resolution__roll-row--final">
                    <CountInput
                      label="Final Hits"
                      value={finalAttackHits}
                      max={maxAttackDice}
                      onChange={(next) => setFinalAttackHits(next)}
                      disabled={!isAttackerRole}
                      testId="final-hits"
                    />
                    <CountInput
                      label="Final Crits"
                      value={finalAttackCrits}
                      max={maxAttackDice}
                      onChange={(next) => setFinalAttackCrits(next)}
                      disabled={!isAttackerRole}
                      testId="final-crits"
                    />
                  </div>
                </div>

                <div className="attack-resolution__damage-preview">
                  <div className="attack-resolution__damage-line">
                    <span>Remaining:</span>
                    <strong>
                      {finalPreview.remainingHits} hits ·{" "}
                      {finalPreview.remainingCrits} crits
                    </strong>
                  </div>
                  <div className="attack-resolution__damage-line">
                    <span>Weapon:</span>
                    <strong>
                      {finalPreview.normalDamage}/{finalPreview.critDamage}
                    </strong>
                  </div>
                  <div className="attack-resolution__damage-total">
                    Total Damage: <strong>{finalPreview.totalDamage}</strong>
                  </div>
                  <div className="attack-resolution__damage-sub">
                    (Final entry ignores defender blocks — fast mode.)
                  </div>
                </div>

                <button
                  className="kt-modal__btn kt-modal__btn--primary"
                  type="button"
                  onClick={() => {
                    addLog("Final", "Resolved via final entry window.");
                    resolveFromFinalWindow();
                  }}
                  disabled={!isAttackerRole}
                >
                  Apply Damage
                </button>
              </div>
            </div>

            {/* Firefight Ploys (row style) */}
            <div className="attack-resolution__ploys">
              <div className="attack-resolution__section-title">
                {firefightPloys.label}
              </div>

              {firefightPloys.ploys.length === 0 ? (
                <div className="attack-resolution__empty">No ploys available.</div>
              ) : (
                <div className="attack-resolution__ploy-list">
                  {firefightPloys.ploys.map((ploy) => (
                    <button
                      key={ploy.id}
                      type="button"
                      className="attack-resolution__ploy"
                      onClick={() => {
                        const cost = ploy?.cost?.cp ? `${ploy.cost.cp}CP` : "—";
                        addLog("Ploy", `Used ${ploy.name} (${cost}).`);
                      }}
                    >
                      <div className="attack-resolution__ploy-name">{ploy.name}</div>
                      <div className="attack-resolution__ploy-meta">
                        <span className="attack-resolution__ploy-cost">
                          {ploy?.cost?.cp ? `${ploy.cost.cp}CP` : "—"}
                        </span>
                        <span className="attack-resolution__ploy-timing">
                          {ploy.timing || "—"}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export default AttackResolutionScreen;
