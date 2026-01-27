import { useEffect, useMemo, useRef, useState } from "react";
import "./AttackResolutionScreen.css";
import AttackSummaryBar from "../components/AttackSummaryBar";
import UnitCard from "../components/UnitCard";
import { normalizeWeaponRules } from "../../engine/rules/weaponRules";
import { allocateDefense } from "../../engine/rules/resolveDice";

const PHASES = {
  PRE_ROLL: "PRE_ROLL",
  ROLL_INPUT: "ROLL_INPUT",
  REROLL: "REROLL",
  LOCKED_ATTACK: "LOCKED_ATTACK",
  DEFENSE: "DEFENSE",
  RESOLVED: "RESOLVED",
};

const buildDieArray = (hits, crits, hitValue = 4) => {
  const safeHits = Math.max(0, Number(hits) || 0);
  const safeCrits = Math.max(0, Number(crits) || 0);
  const hitDice = Array.from({ length: safeHits }, () => hitValue);
  const critDice = Array.from({ length: safeCrits }, () => 6);
  return [...critDice, ...hitDice];
};

const clampNumber = (value, min, max) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(max, Math.max(min, parsed));
};

function AttackResolutionScreen({
  open,
  role,
  attacker,
  defender,
  weapon,
  combatStage,
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
  const [attackHits, setAttackHits] = useState(0);
  const [attackCrits, setAttackCrits] = useState(0);
  const [defenseHits, setDefenseHits] = useState(0);
  const [defenseCrits, setDefenseCrits] = useState(0);
  const [usedRules, setUsedRules] = useState({});
  const [logs, setLogs] = useState([]);
  const logIdRef = useRef(0);

  const hitThreshold = Number(weapon?.hit ?? 6);
  const saveThreshold = Number(defender?.stats?.save ?? 6);
  const maxAttackDice = Math.max(0, Number(attackDiceCount || 0));
  const maxDefenseDice = Math.max(0, Number(defenseDiceCount || 0));

  const addLog = (group, message) => {
    logIdRef.current += 1;
    setLogs((prev) => [
      ...prev,
      { id: logIdRef.current, group, message, ts: Date.now() },
    ]);
  };

  useEffect(() => {
    if (!open) return;
    setUsedRules({});
    setLogs([]);
    setAttackHits(0);
    setAttackCrits(0);
    setDefenseHits(0);
    setDefenseCrits(0);

    if (role === "attacker") {
      if (combatStage === "ATTACK_ROLLING") {
        setPhase(PHASES.PRE_ROLL);
      } else if (combatStage === "ATTACK_LOCKED" || combatStage === "DEFENSE_ROLLING") {
        setPhase(PHASES.LOCKED_ATTACK);
      } else if (combatStage === "DONE") {
        setPhase(PHASES.RESOLVED);
      }
      return;
    }

    if (role === "defender") {
      if (combatStage === "DEFENSE_ROLLING") {
        setPhase(PHASES.DEFENSE);
      } else if (combatStage === "DONE") {
        setPhase(PHASES.RESOLVED);
      } else {
        setPhase(PHASES.LOCKED_ATTACK);
      }
    }
  }, [open, role, combatStage]);

  useEffect(() => {
    if (!open) return;
    if (role !== "attacker") return;
    if (combatStage === "ATTACK_LOCKED" || combatStage === "DEFENSE_ROLLING") {
      setPhase(PHASES.LOCKED_ATTACK);
    }
  }, [open, role, combatStage]);

  const rules = useMemo(() => {
    if (!weapon) return [];
    return normalizeWeaponRules(weapon).map((rule) => {
      const timing = ["accurate"].includes(rule.id) ? "PRE_ROLL" : "REROLL";
      return {
        ...rule,
        timing,
      };
    });
  }, [weapon]);

  const rerollActions = rules.filter((rule) => rule.timing === "REROLL");
  const preRollActions = rules.filter((rule) => rule.timing === "PRE_ROLL");

  const handleAttackInput = (nextHits, nextCrits) => {
    const safeHits = clampNumber(nextHits, 0, maxAttackDice);
    const safeCrits = clampNumber(nextCrits, 0, maxAttackDice);
    if (safeHits + safeCrits > maxAttackDice) return;
    setAttackHits(safeHits);
    setAttackCrits(safeCrits);
    addLog("Roll", `Attacker set hits ${safeHits}, crits ${safeCrits}.`);
  };

  const handleDefenseInput = (nextHits, nextCrits) => {
    const safeHits = clampNumber(nextHits, 0, maxDefenseDice);
    const safeCrits = clampNumber(nextCrits, 0, maxDefenseDice);
    if (safeHits + safeCrits > maxDefenseDice) return;
    setDefenseHits(safeHits);
    setDefenseCrits(safeCrits);
    addLog("Roll", `Defender set saves ${safeHits}, crit saves ${safeCrits}.`);
  };

  const applyRerollBoost = (ruleId, label) => {
    if (usedRules[ruleId]) return;
    if (attackHits + attackCrits >= maxAttackDice) return;
    setAttackHits((prev) => prev + 1);
    setUsedRules((prev) => ({ ...prev, [ruleId]: true }));
    addLog("Re-Roll", `${label} applied (+1 hit).`);
  };

  const handleLockAttack = () => {
    const attackDice = buildDieArray(attackHits, attackCrits, hitThreshold);
    onSetAttackRoll?.(attackDice);
    onLockAttack?.();
    addLog("Lock", "Attacker locked in results.");
    setPhase(PHASES.LOCKED_ATTACK);
  };

  const resolveDamage = () => {
    const [normalDmg, critDmg] = String(weapon?.dmg || "0/0")
      .split("/")
      .map((value) => Number(value));
    const allocation = allocateDefense({
      attackHits,
      attackCrits,
      defenseHits,
      defenseCrits,
      normalDamage: Number.isFinite(normalDmg) ? normalDmg : 0,
      critDamage: Number.isFinite(critDmg) ? critDmg : 0,
    });
    const totalDamage =
      allocation.remainingHits * (Number.isFinite(normalDmg) ? normalDmg : 0) +
      allocation.remainingCrits * (Number.isFinite(critDmg) ? critDmg : 0);
    addLog(
      "Damage",
      `Remaining hits ${allocation.remainingHits}, crits ${allocation.remainingCrits}. Total damage ${totalDamage}.`,
    );
    if (defender?.id && totalDamage > 0) {
      onApplyDamage?.(defender.id, totalDamage);
    }
    onResolveComplete?.();
    setPhase(PHASES.RESOLVED);
  };

  const handleLockDefense = () => {
    const defenseDice = buildDieArray(defenseHits, defenseCrits, saveThreshold);
    onSetDefenseRoll?.(defenseDice);
    onLockDefense?.();
    addLog("Lock", "Defender locked in saves.");
    resolveDamage();
  };

  if (!open || !attacker || !defender || !weapon) return null;

  return (
    <div className="kt-modal" data-testid="attack-resolution-modal">
      <div className="kt-modal__backdrop" onClick={() => onCancel?.()} />
      <div className="kt-modal__panel attack-resolution__modal-panel">
        <button
          className="kt-modal__close"
          type="button"
          onClick={() => onCancel?.()}
          aria-label="Close"
          title="Close"
        >
          ×
        </button>
        <div className="attack-resolution">
          <aside className="attack-resolution__log">
            <div className="attack-resolution__log-title">Battle Log</div>
            <div className="attack-resolution__log-list">
              {logs.length === 0 && (
                <div className="attack-resolution__log-empty">No entries yet.</div>
              )}
              {logs.map((entry) => (
                <div key={entry.id} className="attack-resolution__log-entry">
                  <span className="attack-resolution__log-group">{entry.group}</span>
                  <span>{entry.message}</span>
                </div>
              ))}
            </div>
          </aside>
          <section className="attack-resolution__main">
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

            <AttackSummaryBar attacker={attacker} defender={defender} weapon={weapon} />

            <div className="attack-resolution__panel">
              <div className="attack-resolution__section">
                <div className="attack-resolution__section-title">Fast Resolve</div>
                <div className="attack-resolution__inputs">
                  <div>
                    <div className="attack-resolution__label">Attacker Hits</div>
                    <input
                      className="attack-resolution__input"
                      type="number"
                      min="0"
                      max={maxAttackDice}
                      value={attackHits}
                      onChange={(event) =>
                        handleAttackInput(event.target.value, attackCrits)
                      }
                    />
                  </div>
                  <div>
                    <div className="attack-resolution__label">Attacker Crits</div>
                    <input
                      className="attack-resolution__input"
                      type="number"
                      min="0"
                      max={maxAttackDice}
                      value={attackCrits}
                      onChange={(event) =>
                        handleAttackInput(attackHits, event.target.value)
                      }
                    />
                  </div>
                  <div>
                    <div className="attack-resolution__label">Defender Saves</div>
                    <input
                      className="attack-resolution__input"
                      type="number"
                      min="0"
                      max={maxDefenseDice}
                      value={defenseHits}
                      onChange={(event) =>
                        handleDefenseInput(event.target.value, defenseCrits)
                      }
                    />
                  </div>
                  <div>
                    <div className="attack-resolution__label">Defender Crit Saves</div>
                    <input
                      className="attack-resolution__input"
                      type="number"
                      min="0"
                      max={maxDefenseDice}
                      value={defenseCrits}
                      onChange={(event) =>
                        handleDefenseInput(defenseHits, event.target.value)
                      }
                    />
                  </div>
                </div>
                <button
                  className="kt-modal__btn kt-modal__btn--primary"
                  type="button"
                  onClick={() => {
                    addLog("Fast", "Fast-resolved attack input by player.");
                    resolveDamage();
                  }}
                >
                  Resolve
                </button>
              </div>

              {phase === PHASES.PRE_ROLL && role === "attacker" && (
                <div className="attack-resolution__section">
                  <div className="attack-resolution__section-title">Pre-Roll</div>
                  <div className="attack-resolution__rules">
                    {preRollActions.length === 0 && (
                      <div className="attack-resolution__empty">No pre-roll rules.</div>
                    )}
                    {preRollActions.map((rule) => (
                      <button
                        key={rule.id}
                        className="attack-resolution__rule"
                        type="button"
                        onClick={() => {
                          setUsedRules((prev) => ({ ...prev, [rule.id]: true }));
                          addLog("Pre-Roll", `Confirmed ${rule.id}.`);
                        }}
                        disabled={usedRules[rule.id]}
                      >
                        {rule.id} {rule.value ?? ""}
                      </button>
                    ))}
                  </div>
                  <button
                    className="kt-modal__btn kt-modal__btn--primary"
                    type="button"
                    onClick={() => {
                      addLog("Pre-Roll", "Pre-roll complete.");
                      setPhase(PHASES.ROLL_INPUT);
                    }}
                  >
                    Continue
                  </button>
                </div>
              )}

              {phase === PHASES.ROLL_INPUT && role === "attacker" && (
                <div className="attack-resolution__section">
                  <div className="attack-resolution__section-title">Roll Input</div>
                  <div className="attack-resolution__inputs">
                    <div>
                      <div className="attack-resolution__label">Hits</div>
                      <input
                        className="attack-resolution__input"
                        type="number"
                        min="0"
                        max={maxAttackDice}
                        value={attackHits}
                        onChange={(event) =>
                          handleAttackInput(event.target.value, attackCrits)
                        }
                      />
                    </div>
                    <div>
                      <div className="attack-resolution__label">Crits</div>
                      <input
                        className="attack-resolution__input"
                        type="number"
                        min="0"
                        max={maxAttackDice}
                        value={attackCrits}
                        onChange={(event) =>
                          handleAttackInput(attackHits, event.target.value)
                        }
                      />
                    </div>
                  </div>
                  <button
                    className="kt-modal__btn kt-modal__btn--primary"
                    type="button"
                    onClick={() => {
                      addLog("Roll", "Roll input confirmed.");
                      setPhase(PHASES.REROLL);
                    }}
                  >
                    Continue
                  </button>
                </div>
              )}

              {phase === PHASES.REROLL && role === "attacker" && (
                <div className="attack-resolution__section">
                  <div className="attack-resolution__section-title">Re-Rolls</div>
                  <div className="attack-resolution__rules">
                    {rerollActions.length === 0 && (
                      <div className="attack-resolution__empty">No rerolls.</div>
                    )}
                    {rerollActions.map((rule) => (
                      <button
                        key={rule.id}
                        className="attack-resolution__rule"
                        type="button"
                        onClick={() =>
                          applyRerollBoost(rule.id, rule.id.toUpperCase())
                        }
                        disabled={usedRules[rule.id]}
                      >
                        {rule.id}
                      </button>
                    ))}
                  </div>
                  <button
                    className="kt-modal__btn kt-modal__btn--primary"
                    type="button"
                    onClick={handleLockAttack}
                    disabled={attackHits + attackCrits === 0}
                  >
                    Lock In Attack
                  </button>
                </div>
              )}

              {phase === PHASES.LOCKED_ATTACK && (
                <div className="attack-resolution__section">
                  <div className="attack-resolution__section-title">Attack Locked</div>
                  <div className="attack-resolution__empty">
                    Waiting for defense...
                  </div>
                </div>
              )}

              {phase === PHASES.DEFENSE && role === "defender" && (
                <div className="attack-resolution__section">
                  <div className="attack-resolution__section-title">Defense</div>
                  <div className="attack-resolution__inputs">
                    <div>
                      <div className="attack-resolution__label">Saves</div>
                      <input
                        className="attack-resolution__input"
                        type="number"
                        min="0"
                        max={maxDefenseDice}
                        value={defenseHits}
                        onChange={(event) =>
                          handleDefenseInput(event.target.value, defenseCrits)
                        }
                      />
                    </div>
                    <div>
                      <div className="attack-resolution__label">Crit Saves</div>
                      <input
                        className="attack-resolution__input"
                        type="number"
                        min="0"
                        max={maxDefenseDice}
                        value={defenseCrits}
                        onChange={(event) =>
                          handleDefenseInput(defenseHits, event.target.value)
                        }
                      />
                    </div>
                  </div>
                  <button
                    className="kt-modal__btn kt-modal__btn--primary"
                    type="button"
                    onClick={handleLockDefense}
                    disabled={defenseHits + defenseCrits === 0}
                  >
                    Lock In Defense
                  </button>
                </div>
              )}

              {phase === PHASES.RESOLVED && (
                <div className="attack-resolution__section">
                  <div className="attack-resolution__section-title">Resolved</div>
                  <div className="attack-resolution__empty">
                    Combat resolved.
                  </div>
                </div>
              )}
            </div>

            <div className="attack-resolution__ploys">
              <div className="attack-resolution__section-title">Firefight Ploys</div>
              <div className="attack-resolution__empty">No ploys available.</div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export default AttackResolutionScreen;
