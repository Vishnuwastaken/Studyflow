import { STORAGE, createDefaultState, normalizeDeck } from '../models/dataModels.js';

export const loadState = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE));
    if (!raw) return createDefaultState();
    const defaults = createDefaultState();
    return {
      user: Object.assign(defaults.user, raw.user || {}),
      pet: Object.assign(defaults.pet, raw.pet || {}),
      starterDecks: Array.isArray(raw.starterDecks) && raw.starterDecks.length ? raw.starterDecks.map(normalizeDeck) : defaults.starterDecks,
      decks: Array.isArray(raw.decks) ? raw.decks.map(normalizeDeck) : [],
      sessions: Object.assign({ recent:null, quizLocks:{}, forcedReviewDeckId:null, modeLocks:{}, reviewEasyTracker:{} }, raw.sessions || {})
    };
  } catch {
    return createDefaultState();
  }
};

export const saveState = state => localStorage.setItem(STORAGE, JSON.stringify(state));
