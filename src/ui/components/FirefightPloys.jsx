import "./FirefightPloys.css";

const ployModules = import.meta.glob(
  "../../data/killteams/**/**/*FirefightPloys.json",
  { eager: true },
);

const normalizeData = (moduleData) => moduleData?.default || moduleData || null;

function FirefightPloys({ armyKey, cp = null, isVisible = true, isEnabled = true, onUsePloy }) {
  if (!isVisible) return null;
  if (!armyKey) return null;

  const keyLower = String(armyKey).toLowerCase();
  const entry = Object.entries(ployModules).find(([path]) => {
    const normalized = path.toLowerCase();
    return (
      normalized.includes(`/${keyLower}/`) ||
      normalized.includes(`${keyLower}firefightploys`)
    );
  });

  const data = normalizeData(entry?.[1]);
  const ploys = Array.isArray(data?.ploys) ? data.ploys : [];

  if (ploys.length === 0) return null;

  return (
    <section className="kt-firefight-ploys">
      <div className="kt-firefight-ploys__list" role="list">
        {ploys.map((ploy) => {
          const cost = Number(ploy?.cost?.cp ?? 0);
          const hasCost = Number.isFinite(cost);
          const lacksCp = hasCost && Number.isFinite(Number(cp)) ? Number(cp) < cost : false;
          const isDisabled = !isEnabled || lacksCp;
          const ployKey = ploy.id || ploy.name || "ploy";
          return (
            <button
              key={ployKey}
              className="kt-firefight-ploys__item"
              type="button"
              data-testid={`firefight-ploy-${String(ployKey).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
              data-ploy-cost={hasCost ? cost : undefined}
              disabled={isDisabled}
              onClick={() => onUsePloy?.(ploy)}
            >
            <div className="kt-firefight-ploys__name">{ploy.name}</div>
            {ploy.cost?.cp != null && (
              <div className="kt-firefight-ploys__cost">CP {ploy.cost.cp}</div>
            )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default FirefightPloys;
