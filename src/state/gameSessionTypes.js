/**
 * Core entity types for the GameSession state model.
 * Plain data only (no functions).
 */

/**
 * @typedef {Object} Token
 * @property {string} type
 * @property {string=} source
 * @property {{ when: "endOfActivation" | "endOfRound" | "never", round?: number }} expires
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
 * @typedef {"SET_ORDER" | "APPLY_DAMAGE" | "HEAL" | "ADD_TOKEN" | "REMOVE_TOKEN" | "SELECT_OPERATIVE" | "SELECT_WEAPON" | "SPEND_APL" | "END_ACTIVATION" | "NEXT_PHASE" | "NEXT_ROUND"} GameEventType
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
 */

/**
 * @typedef {Object} GameActiveState
 * @property {number} turn
 * @property {number} round
 * @property {"strategy" | "firefight" | "end"} phase
 * @property {string} initiativePlayerId
 * @property {string} activePlayerId
 * @property {GameActivation} activation
 */

/**
 * @typedef {Object} GameSession
 * @property {string} id
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {[Player, Player]} players
 * @property {Record<string, Team>} teamsById
 * @property {GameActiveState} active
 * @property {GameEvent[]} eventLog
 * @property {Object=} derivedCache
 */

export {};
