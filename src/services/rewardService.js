import { addDays, today } from '../utils/helpers.js';

export const xpForLevel = level => 60 + (level - 1) * 35;

export function addXP(state, n, toast){
  state.pet.xp += n;
  while(state.pet.xp >= xpForLevel(state.pet.level)){
    state.pet.xp -= xpForLevel(state.pet.level);
    state.pet.level++;
    state.pet.mood = 'excited';
    state.pet.lastMoodAt = Date.now();
    toast?.('Pet leveled up');
  }
}

export function awardSession(state, studyResults, cardsCount, sessionDone, allDecks, activeCards){
  const xp = cardsCount * 5 + (sessionDone ? 10 : 0);
  const points = cardsCount * 3 + (sessionDone ? 6 : 0);
  state.user.points += points;
  addXP(state, xp);
  studyResults.xp += xp;
  studyResults.points += points;

  const y = addDays(today(), -1);
  const last = state.user.streak.lastStudyDate;
  if(last !== today()){
    state.user.streak.current = (last === y) ? state.user.streak.current + 1 : 1;
    state.user.streak.lastStudyDate = today();
  }

  const totalReviews = allDecks().flatMap(d => d.cards).reduce((n, c) => n + (c.stats.reviews || 0), 0);
  if(totalReviews >= 50 && !state.user.achievements.cards50){
    state.user.achievements.cards50 = true;
    state.user.points += 40;
    addXP(state, 25);
    studyResults.unlocks.push('50 cards studied');
  }
  const mastered = allDecks().some(d => activeCards(d).length && activeCards(d).every(c => c.stats.mastered));
  if(mastered && !state.user.achievements.masterDeck){
    state.user.achievements.masterDeck = true;
    state.user.points += 50;
    addXP(state, 30);
    studyResults.unlocks.push('Mastered a deck');
  }
  state.pet.mood = sessionDone ? 'excited' : 'happy';
  state.pet.lastMoodAt = Date.now();
  return { xp, points };
}
