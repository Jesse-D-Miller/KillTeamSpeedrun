import "./FirefightPloys.css";

const ployModules = import.meta.glob(
  "../../data/killteams/**/**/*FirefightPloys.json",
  { eager: true },
);

const normalizeData = (moduleData) => moduleData?.default || moduleData || null;
const resolvePloyImage = (image) => {
  if (!image) return "/killteamSpeedrunLogo.png";
  if (typeof image !== "string") return "/killteamSpeedrunLogo.png";
  if (image.startsWith("http://") || image.startsWith("https://")) return image;
  if (image.startsWith("/")) return image;
  if (image.startsWith("public/")) return `/${image.slice("public/".length)}`;
  return `/${image}`;
};
const normalizeKey = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
const extractTeamKeyFromPath = (path) => {
  const match = String(path || "").match(/\/killteams\/([^/]+)\//i);
  return match ? match[1] : null;
};

function FirefightPloys({ armyKey, cp = null, isVisible = true, isEnabled = true, onUsePloy }) {
  if (!isVisible) return null;
  if (!armyKey) return null;

  const targetKey = normalizeKey(armyKey);
  const entries = Object.entries(ployModules).map(([path, mod]) => {
    const data = normalizeData(mod);
    return {
      path,
      data,
      teamKey: extractTeamKeyFromPath(path),
      normalizedTeamKey: normalizeKey(extractTeamKeyFromPath(path)),
      normalizedKillTeam: normalizeKey(data?.killTeam),
    };
  });

  const entry = entries.find((candidate) =>
    [candidate.normalizedTeamKey, candidate.normalizedKillTeam].includes(targetKey),
  );

  const fallback = entry || entries[0];
  const data = fallback?.data || null;
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
          const imageSrc = resolvePloyImage(ploy?.image);
          return (
            <button
              key={ployKey}
              className="kt-firefight-ploys__item"
              type="button"
              aria-label={ploy.name || ployKey}
              data-testid={`firefight-ploy-${String(ployKey).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
              data-ploy-cost={hasCost ? cost : undefined}
              disabled={isDisabled}
              onClick={() => onUsePloy?.(ploy)}
            >
              <img
                className="kt-firefight-ploys__image"
                src={imageSrc}
                alt={ploy.name || ployKey}
                loading="lazy"
              />
              {hasCost && (
                <span className="kt-firefight-ploys__cost-badge">{cost}CP</span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default FirefightPloys;
