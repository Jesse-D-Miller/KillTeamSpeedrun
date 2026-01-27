import "./AttackSummaryBar.css";
import { normalizeWeaponRules } from "../../engine/rules/weaponRules";

function AttackSummaryBar({ attacker, defender, weapon }) {
  if (!attacker || !defender || !weapon) return null;

  const diceCount = Number(weapon.atk ?? 0);
  const hitThreshold = Number(weapon.hit ?? 0);
  const critThreshold = Number(weapon.crit ?? 6);
  const saveThreshold = Number(defender.stats?.save ?? 0);
  const keywords = normalizeWeaponRules(weapon)
    .map((rule) => {
      const value = rule?.value ?? null;
      return value !== null && value !== undefined && value !== ""
        ? `${rule.id} ${value}`
        : rule.id;
    })
    .filter(Boolean);

  return (
    <div className="attack-summary">
      <div className="attack-summary__row">
        <span className="attack-summary__stat">{diceCount} ATK</span>
        <span className="attack-summary__stat">Hit {hitThreshold}+</span>
        <span className="attack-summary__stat">Crit {critThreshold}+</span>
        <span className="attack-summary__stat">Save {saveThreshold}+</span>
      </div>
      <div className="attack-summary__row attack-summary__row--keywords">
        {keywords.length > 0 ? keywords.join(" • ") : "No active keywords"}
      </div>
    </div>
  );
}

export default AttackSummaryBar;
