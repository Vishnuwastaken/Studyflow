import { esc } from '../utils/helpers.js';

export const renderProgressBar = percent => `<div class="progress"><div style="width:${Math.max(0,Math.min(100,percent))}%"></div></div>`;

export function renderPetDisplay({ big=false, color='#8cc8ff', hat=false, glasses=false, mood='calm', stage=1, celebrate=false }){
  const evolutionClass = `stage-${Math.max(1, Math.min(5, stage || 1))}`;
  const moodClass = `mood-${mood || 'calm'}`;
  return `<div class="pet-wrap"><div class="pet ${big ? 'big' : ''} ${evolutionClass} ${moodClass} ${celebrate ? 'level-up' : ''}" style="--pet-color:${color}"><div class="ear left"></div><div class="ear right"></div><div class="pet-body"></div><div class="pet-mark"></div>${hat?'<div class="hat"></div>':''}${glasses?'<div class="glasses"><i></i></div>':''}<div class="eye left"></div><div class="eye right"></div><div class="mouth ${mood}"></div></div></div>`;
}

export const renderFlashcardComponent = ({text, flipped=false}) => `<div class="flashcard ${flipped ? 'flipped' : ''}">${esc(text)}</div>`;

export const renderQuizComponent = (options, quizState={ answered:false, selectedIndex:null, correctIndex:-1 }) => `<div class="list">${options.map((o,i)=>{
  const classes = ['btn','secondary','quiz-option'];
  if(quizState.answered && i === quizState.correctIndex) classes.push('correct');
  if(quizState.answered && i === quizState.selectedIndex && i !== quizState.correctIndex) classes.push('wrong');
  return `<button id="quiz-opt-${i}" class="${classes.join(' ')}" ${quizState.answered?'disabled':''}>${esc(o.text)}</button>`;
}).join('')}</div>`;

export const renderMatchingComponent = ({ terms, answers, selectedTerm, feedback, locked, mistakes }) => `<div><div class="tiny" style="margin-bottom:10px">Mistakes: ${mistakes}</div><div class="grid2"><div><div class="small" style="margin-bottom:8px">Terms</div><div class="list">${terms.map(t=>`<button id="match-term-${t.id}" class="btn secondary match-option ${selectedTerm===t.id?'selected':''} ${feedback?.termId===t.id?(feedback.correct?'correct':'wrong'):''}" ${locked?'disabled':''}>${esc(t.text)}</button>`).join('')}</div></div><div><div class="small" style="margin-bottom:8px">Answers</div><div class="list">${answers.map(a=>`<button id="match-answer-${a.id}" class="btn secondary match-option ${feedback?.answerId===a.id?(feedback.correct?'correct':'wrong'):''}" ${locked?'disabled':''}>${esc(a.text)}</button>`).join('')}</div></div></div></div>`;

export const renderDeckListComponent = (decks, itemRenderer) => decks.length ? `<div class="list">${decks.map(itemRenderer).join('')}</div>` : '<div class="empty">No decks available.</div>';
