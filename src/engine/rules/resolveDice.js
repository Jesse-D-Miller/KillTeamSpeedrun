export function parseHits(diceRolls, hitThreshold) {
  let hits = 0;
  let crits = 0;

  diceRolls.forEach((roll) => {
    if (roll === 6) crits++;
    else if (roll >= hitThreshold) hits++;
  });

  return { hits, crits };
}