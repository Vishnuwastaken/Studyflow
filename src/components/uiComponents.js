import { esc } from '../utils/helpers.js';

export const renderProgressBar = percent => `<div class="progress"><div style="width:${Math.max(0,Math.min(100,percent))}%"></div></div>`;

export function renderPetDisplay({ big=false, color='#8cc8ff', hat=false, glasses=false, mood='calm' }){
  return `<div class="pet-wrap"><div class="pet ${big ? 'big' : ''}" style="--pet-color:${color}"><div class="ear left"></div><div class="ear right"></div><div class="pet-body"></div>${hat?'<div class="hat"></div>':''}${glasses?'<div class="glasses"><i></i></div>':''}<div class="eye left"></div><div class="eye right"></div><div class="mouth ${mood}"></div></div></div>`;
}

export const renderFlashcardComponent = ({text, flipped=false}) => `<div class="flashcard ${flipped ? 'flipped' : ''}">${esc(text)}</div>`;

export const renderQuizComponent = options => `<div class="list">${options.map((o,i)=>`<button id="quiz-opt-${i}" class="btn secondary quiz-option">${esc(o.text)}</button>`).join('')}</div>`;

export const renderMatchingComponent = ({ terms, answers, selectedTerm, matched, feedback }) => `<div class="grid2"><div><div class="small" style="margin-bottom:8px">Terms</div><div class="list">${terms.map(t=>`<button id="match-term-${t.id}" class="btn secondary match-option ${selectedTerm===t.id?'selected':''} ${feedback?.termId===t.id?(feedback.correct?'correct':'wrong'):''}" ${matched[t.id]?'disabled':''}>${esc(t.text)}</button>`).join('')}</div></div><div><div class="small" style="margin-bottom:8px">Answers</div><div class="list">${answers.map(a=>`<button id="match-answer-${a.id}" class="btn secondary match-option ${feedback?.answerId===a.id?(feedback.correct?'correct':'wrong'):''}" ${Object.values(matched).includes(a.id)?'disabled':''}>${esc(a.text)}</button>`).join('')}</div></div></div>`;

export const renderDeckListComponent = (decks, itemRenderer) => decks.length ? `<div class="list">${decks.map(itemRenderer).join('')}</div>` : '<div class="empty">No decks available.</div>';
