import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import TargetSelectModal from "../components/TargetSelectModal";
import { normalizeWeaponRules, runWeaponRuleHook } from "../../engine/rules/weaponRules";

function TargetSelectScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const { username } = useParams();
  const mode = location.state?.mode || "shoot";
  const slot = location.state?.slot || null;
  const gameCode = location.state?.gameCode || null;
  const attackerId = location.state?.attackerId || null;

  const [gameState, setGameState] = useState(() =>
    typeof window !== "undefined" && typeof window.ktGetGameState === "function"
      ? window.ktGetGameState()
      : null,
  );

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (typeof window.ktSubscribeGameState === "function") {
      const unsubscribe = window.ktSubscribeGameState((nextState) => {
        setGameState(nextState);
      });
      return () => unsubscribe?.();
    }
    const handleState = (event) => {
      setGameState(event.detail?.state || null);
    };
    window.addEventListener("kt:state", handleState);
    return () => window.removeEventListener("kt:state", handleState);
  }, []);

  const backTarget = `/${username}/army`;
  const backState = {
    ...(slot ? { slot } : {}),
    ...(gameCode ? { gameCode } : {}),
  };

  const attacker = useMemo(() => {
    if (!gameState?.game || !attackerId) return null;
    return gameState.game.find((unit) => unit.id === attackerId) || null;
  }, [gameState, attackerId]);

  const targets = useMemo(() => {
    if (!gameState?.game || !attacker?.teamId) return [];
    return gameState.game.filter((unit) => unit.teamId !== attacker.teamId);
  }, [gameState, attacker]);

  const [primaryTargetId, setPrimaryTargetId] = useState(null);
  const [secondaryTargetIds, setSecondaryTargetIds] = useState([]);

  const selectedWeaponName =
    attacker?.state?.selectedWeapon || attacker?.weapons?.[0]?.name;
  const selectedWeapon =
    attacker?.weapons?.find((w) => w.name === selectedWeaponName) ||
    attacker?.weapons?.[0] ||
    null;

  const hasBlast = useMemo(() => {
    if (!selectedWeapon) return false;
    return normalizeWeaponRules(selectedWeapon).some((rule) => rule.id === "blast");
  }, [selectedWeapon]);

  const dispatchGameEvent = (type, payload = {}) => {
    if (typeof window !== "undefined" && typeof window.ktDispatchGameEvent === "function") {
      window.ktDispatchGameEvent(type, payload);
    }
  };

  const dispatchCombatEvent = (type, payload = {}) => {
    if (typeof window !== "undefined" && typeof window.ktDispatchCombatEvent === "function") {
      window.ktDispatchCombatEvent(type, payload);
    }
  };

  const handleClose = () => {
    if (mode === "shoot" || mode === "fight") {
      dispatchGameEvent("FLOW_CANCEL");
    }
    navigate(backTarget, { state: backState });
  };

  const handleConfirm = () => {
    if (!primaryTargetId) return;
    if (mode === "fight") {
      dispatchGameEvent("FLOW_SET_TARGET", { defenderId: primaryTargetId });
      navigate(backTarget, { state: backState });
      return;
    }

    const blastInputs = {
      primaryTargetId,
      secondaryTargetIds,
    };
    const ctx = {
      weapon: selectedWeapon,
      weaponProfile: selectedWeapon,
      weaponRules: normalizeWeaponRules(selectedWeapon),
      inputs: blastInputs,
      modifiers: {},
      log: [],
    };
    runWeaponRuleHook(ctx, "ON_DECLARE_ATTACK");
    const attackQueue = Array.isArray(ctx.attackQueue) ? ctx.attackQueue : [];
    const firstTargetId = attackQueue[0]?.targetId ?? primaryTargetId;

    dispatchCombatEvent("START_RANGED_ATTACK", {
      attackerId: slot || null,
      defenderId: slot === "A" ? "B" : slot === "B" ? "A" : null,
      attackingOperativeId: attacker?.id || null,
      defendingOperativeId: firstTargetId,
      weaponId: selectedWeapon?.name || null,
      weaponProfile: selectedWeapon || null,
      attackQueue,
      inputs: blastInputs,
    });

    dispatchGameEvent("FLOW_CANCEL");

    navigate(backTarget, { state: backState });
  };

  const confirmLabel = mode === "fight" ? "Fight" : "Shoot";
  const weaponMode = mode === "fight" ? "melee" : "ranged";

  return (
    <TargetSelectModal
      open={true}
      attacker={attacker}
      targets={targets}
      primaryTargetId={primaryTargetId}
      secondaryTargetIds={secondaryTargetIds}
      allowSecondarySelection={mode === "shoot" && hasBlast}
      confirmLabel={confirmLabel}
      weaponMode={weaponMode}
      onSelectPrimary={(id) => {
        setPrimaryTargetId(id);
        setSecondaryTargetIds([]);
      }}
      onToggleSecondary={(id) => {
        setSecondaryTargetIds((prev) =>
          prev.includes(id)
            ? prev.filter((entry) => entry !== id)
            : [...prev, id],
        );
      }}
      onClose={handleClose}
      onConfirm={handleConfirm}
    />
  );
}

export default TargetSelectScreen;
