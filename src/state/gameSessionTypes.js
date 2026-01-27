/**
 * Core entity types for the GameSession state model.
 * Plain data only (no functions).
 */

/**
 * @typedef {Object} Token
 * @property {string} type
 * @property {string=} source
 * @property {{ when: "END_ACTIVATION" | "END_TP" | "NEVER", round?: number }} expires
 */

/**
 * @typedef {Object} OperativeBase
 * @property {{ apl: number, move: string|number, save: number, woundsMax: number }} stats
 * @property {Array<Object>} weapons
 * @property {Array<Object>} abilities
 * @property {Array<Object>} rules
 */

/**
 * @typedef {Object} OperativeState
 * @property {number} woundsCurrent
 * @property {"conceal" | "engage"} order
 * @property {Token[]} tokens
 * @property {string[]} effects
 * @property {boolean=} ready
 * @property {boolean=} expended
 * @property {boolean=} counteractedThisTP
 * @property {boolean=} blockedCounteract
 * @property {boolean=} injuredOverride
 * @property {string|null} selectedWeaponId
 * @property {string[]} equipment
 * @property {{ aplCurrent: number, activatedThisRound: boolean }} activation
 */

/**
 * @typedef {Object} Operative
 * @property {string} id
 * @property {string} teamId
 * @property {string} name
 * @property {string} role
 * @property {OperativeBase} base
 * @property {OperativeState} state
 */

/**
 * @typedef {Object} TeamResources
 * @property {number} cp
 * @property {number} vp
 */

/**
 * @typedef {Object} TeamPloyState
 * @property {string[]} strategic
 * @property {string[]} tactical
 */

/**
 * @typedef {Object} Team
 * @property {string} id
 * @property {string} factionKey
 * @property {string} name
 * @property {Operative[]} operatives
 * @property {TeamResources} resources
 * @property {TeamPloyState} ployState
 * @property {Object=} notes
 */

/**
 * @typedef {Object} Player
 * @property {string} id
 * @property {string} displayName
 * @property {string} selectedTeamId
 * @property {Object=} ui
 */

/**
 * @typedef {"START_GAME" | "SET_INITIATIVE" | "START_TURN" | "START_FIREFIGHT" | "OPEN_COUNTERACT_WINDOW" | "DECLARE_COUNTERACT_ACTION" | "RESOLVE_COUNTERACT_ACTION" | "SKIP_COUNTERACT" | "SET_ACTIVE_OPERATIVE" | "END_TURN" | "SET_ORDER" | "APPLY_DAMAGE" | "HEAL" | "SET_WOUNDS" | "SET_INJURED" | "DECLARE_ATTACK" | "ENTER_ATTACK_ROLLS" | "ENTER_DEFENCE_ROLLS" | "RESOLVE_ATTACK" | "USE_PLOY" | "GAIN_CP" | "SPEND_CP" | "ADD_TOKEN" | "REMOVE_TOKEN" | "TOGGLE_TOKEN" | "SELECT_OPERATIVE" | "SELECT_WEAPON" | "SPEND_APL" | "END_ACTIVATION" | "NEXT_PHASE" | "NEXT_ROUND" | "SET_ATTACK_ROLL" | "SET_DEFENSE_ROLL" | "LOCK_ROLLS" | "COMBAT_SET_ROLL_READY" | "USE_FIREFIGHT_PLOY" | "RESOLVE_COMBAT_DONE" | "CANCEL_COMBAT"} GameEventType
 */

/**
 * @typedef {Object} GameEvent
 * @property {string} id
 * @property {string} t
 * @property {GameEventType} type
 * @property {string} actorPlayerId
 * @property {Object} payload
 * @property {Object=} undo
 */

/**
 * @typedef {Object} GameActivation
 * @property {string|null} operativeId
 * @property {number} aplSpent
 * @property {"determine_order" | "perform_actions" | "active" | "resolved"=} state
 */

/**
 * @typedef {Object} GameActiveState
 * @property {number} turn
 * @property {number} round
 * @property {number=} turningPoint
 * @property {"SETUP" | "STRATEGY" | "FIREFIGHT" | "END_TP" | "GAME_OVER"} phase
 * @property {string} initiativePlayerId
 * @property {string} activePlayerId
 * @property {boolean=} started
 * @property {string[]=} activationPriority
 * @property {string|null=} counteractForPlayerId
 * @property {"DETERMINE_ORDER" | "PERFORM_ACTIONS" | "NONE"=} activationSubstep
 * @property {GameActivation} activation
 */

/**
 * @typedef {Object} GameSession
 * @property {string} id
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {[Player, Player]} players
 * @property {Record<string, Team>} teamsById
 * @property {boolean} lockedTeams
 * @property {{ ployUsedByPlayerId: Record<string, Record<string, boolean>>, gambitsUsedByPlayerId: Record<string, Record<string, boolean>> }=} perTurn
 * @property {{ activeByPlayerId: Record<string, Array<{ ployId: string, timingTag?: string, expires: "endOfTurn" | "endOfRound" }>> }=} ployState
 * @property {{ open: boolean, eligiblePlayerId: string|null, selectedOperativeId: string|null, moveBudgetInches: number, moveSpentInches: number, usedOperativeIdsThisTP: string[], state: "NONE" | "SELECT_OPERATIVE" | "PERFORM_ACTION", pendingAction?: { type: string, data?: Object, apCost?: number } }} counteract
 * @property {GameActiveState} active
 * @property {Object=} missionConfig
 * @property {Object|null} currentAttack
 * @property {GameEvent[]} eventLog
 * @property {Object=} derivedCache
 */

export {};
