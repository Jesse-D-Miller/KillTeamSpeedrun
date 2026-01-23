export const ACTION_KEYS = [
  "reposition",
  "dash",
  "shoot",
  "charge",
  "fight",
  "fallBack",
  "pickUpMarker",
  "placeMarker",
];

export const ACTION_CONFIG = {
  reposition: {
    cost: 1,
    darkenSelf: true,
    darkenAlso: ["fallBack", "charge"],
    logLabel: "reposition",
  },
  dash: {
    cost: 1,
    darkenSelf: true,
    darkenAlso: ["charge"],
    logLabel: "dash",
  },
  fallBack: {
    cost: 2,
    darkenSelf: true,
    darkenAlso: ["reposition", "charge"],
    logLabel: "fall back",
  },
  charge: {
    cost: 1,
    darkenSelf: true,
    darkenAlso: ["reposition", "dash", "fallBack"],
    logLabel: "charge",
  },
  pickUpMarker: {
    cost: 1,
    darkenSelf: true,
    darkenAlso: ["placeMarker"],
    logLabel: "pick up marker",
  },
  placeMarker: {
    cost: 1,
    darkenSelf: true,
    darkenAlso: ["pickUpMarker"],
    logLabel: "place marker",
  },
  shoot: {
    cost: 1,
    darkenSelf: true,
    darkenAlso: [],
    logLabel: "shoot",
  },
  fight: {
    cost: 1,
    darkenSelf: true,
    darkenAlso: [],
    logLabel: "fight",
  },
};
