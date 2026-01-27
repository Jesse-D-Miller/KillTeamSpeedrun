import "./FirefightPloys.css";

const ployModules = import.meta.glob(
  "../../data/killteams/**/**/*FirefightPloys.json",
  { eager: true },
);

const normalizeData = (moduleData) => moduleData?.default || moduleData || null;

function FirefightPloys({ armyKey, isVisible = true, isEnabled = true, onUsePloy }) {
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
        {ploys.map((ploy) => (
          <button
            key={ploy.id || ploy.name}
            className="kt-firefight-ploys__item"
            type="button"
            disabled={!isEnabled}
            onClick={() => onUsePloy?.(ploy)}
          >
            <div className="kt-firefight-ploys__name">{ploy.name}</div>
            {ploy.cost?.cp != null && (
              <div className="kt-firefight-ploys__cost">CP {ploy.cost.cp}</div>
            )}
          </button>
        ))}
      </div>
    </section>
  );
}

export default FirefightPloys;
