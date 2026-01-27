export async function lastCombatEvent(page) {
  return await page.evaluate(() => {
    const list = window.__ktE2E_combatEvents || [];
    return list[list.length - 1] || null;
  });
}

export async function lastGameEvent(page) {
  return await page.evaluate(() => {
    const list = window.__ktE2E_gameEvents || [];
    return list[list.length - 1] || null;
  });
}
