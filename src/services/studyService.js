import { addDays, today, clamp } from '../utils/helpers.js';
import { defaultCardStats } from '../models/dataModels.js';

export const activeCards = deck => (deck.cards || []).filter(c => !c.archived);
export const dueCards = deck => activeCards(deck).filter(c => (c.stats.nextReview || today()) <= today());

export function updateCardSchedule(card, rating){
  const s = Object.assign(defaultCardStats(), card.stats || {});
  s[rating] = (s[rating] || 0) + 1;
  s.reviews = (s.reviews || 0) + 1;
  if(rating === 'hard'){
    s.lapses += 1;
    s.interval = 0;
    s.ease = clamp(s.ease - 0.2, 1.3, 3.0);
    s.nextReview = today();
  }else if(rating === 'medium'){
    s.interval = s.interval <= 1 ? 2 : Math.round(s.interval * Math.max(1.2, s.ease - 0.35));
    s.ease = clamp(s.ease - 0.05, 1.3, 3.0);
    s.nextReview = addDays(today(), s.interval);
  }else{
    s.interval = s.interval <= 1 ? 4 : Math.round(s.interval * s.ease);
    s.ease = clamp(s.ease + 0.03, 1.3, 3.0);
    s.nextReview = addDays(today(), s.interval);
  }
  s.mastered = (s.easy >= 3) && (s.easy > s.hard) && s.interval >= 7;
  card.stats = s;
}

export const makeQuizOptions = (deck, card) => {
  const others = [...new Set(activeCards(deck).filter(c => c.id !== card.id).map(c => c.back).filter(Boolean))];
  for(let i=others.length-1;i>0;i--){
    const j = Math.floor(Math.random() * (i + 1));
    [others[i], others[j]] = [others[j], others[i]];
  }
  const distractors = others.filter(text => text !== card.back).slice(0,3);
  let filler = 1;
  while(distractors.length < 3){
    distractors.push(`Alternative answer ${filler}`);
    filler++;
  }
  const optionTexts = [card.back, ...distractors];
  const options = optionTexts.map((text, idx) => ({ text, correct:idx === 0 }));
  for(let i=options.length-1;i>0;i--){
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  return options;
};
