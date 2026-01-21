import { resolveShooting } from "./resolveShooting";
import { resolveMelee } from "./resolveMelee";

export function resolveAttack(input) {
  if (input.weapon.mode === "ranged") {
    return resolveShooting(input);
  }

  if (input.weapon.mode === "melee") {
    return resolveMelee(input);
  }

  throw new Error("Unknown weapon mode");
}
