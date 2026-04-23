import { uid, esc, today } from './utils/helpers.js';
import { ITEMS, defaultCardStats } from './models/dataModels.js';
import { loadState, saveState } from './state/store.js';
import { activeCards, dueCards, updateCardSchedule, makeQuizOptions } from './services/studyService.js';
import { xpForLevel, awardSession } from './services/rewardService.js';
import { readFileText } from './services/fileService.js';
import { generateStudyCards } from './services/aiService.js';
import { renderHomePage } from './pages/homePage.js';
import { renderDecksPage } from './pages/decksPage.js';
import { renderStudyHubPage, renderStudyCardPage, renderMatchingGamePage } from './pages/studyPage.js';
import { renderPetPage } from './pages/petPage.js';

let state = loadState();
let route = 'home';
let study = { cards:[], index:0, flipped:false, mode:'flashcard', options:[], quiz:{ answered:false, selectedIndex:null, correctIndex:-1, correct:false, lastCorrectIndex:null }, typed:{ submitted:false, correct:false, userAnswer:'', correctAnswer:'' }, results:{studied:0, correct:0, xp:0, points:0, unlocks:[], mistakes:0} };
let showArchive = false;
let shopError = '';
const FEED_COST = 8;
const MOOD_STEPS = ['hungry', 'calm', 'happy'];
const MOOD_DECAY_MS = 1000 * 60 * 60 * 8;
const PET_TYPES = ['hat','color','accessory'];

const app = document.getElementById('app');
const shuffle = arr => {
  const copy = [...arr];
  for(let i = copy.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};
const findDeck = id => state.decks.find(d => d.id === id) || state.starterDecks.find(d => d.id === id);
const allDecks = () => [...state.decks, ...state.starterDecks];
const visibleDecks = () => allDecks().filter(d => !d.archived);
const canEdit = deck => state.decks.some(d => d.id === deck.id);
const toItemType = item => item.item_type || (item.category === 'face' ? 'accessory' : item.category);
const petColor = () => ITEMS.find(i => i.id === state.pet.equipped.color)?.color || '#8cc8ff';
const petEvolutionStage = () => Math.max(1, Math.min(5, state.pet.level));
const petMood = () => state.pet.mood === 'happy' ? 'Happy' : state.pet.mood === 'hungry' ? 'Hungry' : 'Calm';
const recentDeck = () => findDeck(state.sessions.recent?.deckId || '');
const save = () => saveState(state);

function ensurePetItemState(){
  const equipped = state.pet.equipped || {};
  state.pet.equipped = {
    hat: equipped.hat || null,
    color: equipped.color || null,
    accessory: equipped.accessory || equipped.face || null
  };
  if(!Array.isArray(state.pet.inventory)) state.pet.inventory = [];
  if(!Array.isArray(state.pet.items)) state.pet.items = [];
  const byId = new Map(state.pet.items.map(entry => [entry.item_id, entry]));
  state.pet.inventory.forEach(id => {
    if(byId.has(id)) return;
    const item = ITEMS.find(i => i.id === id);
    if(!item) return;
    byId.set(id, { item_id:id, item_type:toItemType(item), is_equipped:false });
  });
  state.pet.items = [...byId.values()].filter(entry => state.pet.inventory.includes(entry.item_id)).map(entry => ({ item_id:entry.item_id, item_type:entry.item_type, is_equipped:false }));
  PET_TYPES.forEach(type => {
    const equippedId = state.pet.equipped[type];
    if(equippedId && !state.pet.inventory.includes(equippedId)) state.pet.equipped[type] = null;
  });
  state.pet.items.forEach(entry => {
    entry.is_equipped = state.pet.equipped[entry.item_type] === entry.item_id;
  });
}

ensurePetItemState();

const toast = msg => {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 1800);
};

const deckProgress = deck => {
  const cards = activeCards(deck);
  if(!cards.length) return 0;
  const total = cards.reduce((sum, c) => sum + Math.max(0, Math.min(6, (c.stats.easy||0) * 2 + (c.stats.medium||0) - (c.stats.hard||0))), 0);
  return Math.round(total / (cards.length * 6) * 100);
};
const masteredPct = deck => {
  const cards = activeCards(deck);
  return cards.length ? Math.round(cards.filter(c => c.stats.mastered).length / cards.length * 100) : 0;
};

function setNav(){
  ['home','decks','study','pet'].forEach(p => document.getElementById(`nav-${p}`).classList.toggle('active', route === p));
}

function render(){
  updatePetMoodOverTime();
  if(state.user.daily.date !== today()) state.user.daily = { date:today(), studied:0 };
  setNav();
  if(route === 'home') app.innerHTML = renderHomePage({ recentDeck, state, petMood, petColor, petEvolutionStage, xpForLevel });
  else if(route === 'decks') app.innerHTML = renderDecksPage({ myDecks:state.decks.filter(d=>!d.archived), starterDecks:state.starterDecks.filter(d=>!d.archived), archivedDecks:allDecks().filter(d=>d.archived), deckProgress, masteredPct, activeCards, dueCards, showArchive, points:state.user.points });
  else if(route === 'study') renderStudyHub();
  else app.innerHTML = renderPetPage({ state, items:ITEMS, xpForLevel, petMood, petColor, petEvolutionStage, shopError, feedCost:FEED_COST, toItemType });
}

function updatePetMoodOverTime(){
  const now = Date.now();
  if(!state.pet.lastMoodAt) state.pet.lastMoodAt = now;
  if(!state.pet.lastFedAt) state.pet.lastFedAt = now;
  if(!MOOD_STEPS.includes(state.pet.mood)) state.pet.mood = 'calm';
  const elapsed = now - Math.max(state.pet.lastMoodAt, state.pet.lastFedAt);
  const drops = Math.floor(elapsed / MOOD_DECAY_MS);
  if(drops <= 0) return;
  let moodIndex = MOOD_STEPS.indexOf(state.pet.mood);
  if(moodIndex < 0) moodIndex = 1;
  state.pet.mood = MOOD_STEPS[Math.max(0, moodIndex - drops)];
  state.pet.lastMoodAt = now;
  save();
}

function renderStudyHub(){
  const ds = visibleDecks().filter(d => activeCards(d).length).map(d => ({ id:d.id, name:d.name, cardCount:activeCards(d).length, due:dueCards(d).length }));
  app.innerHTML = renderStudyHubPage(ds);
}

window.navigate = p => { route = p; render(); };
window.toggleArchiveView = () => {
  showArchive = !showArchive;
  render();
};
window.showCreateDeck = () => {
  app.innerHTML = `<div class="card"><div class="h1">Create Deck</div><div style="height:12px"></div><input id="deck-name" placeholder="Deck name"><textarea id="deck-desc" placeholder="Short description"></textarea><div class="grid2"><button class="btn" onclick="createDeck()">Create</button><button class="btn secondary" onclick="navigate('decks')">Cancel</button></div></div>`;
};
window.createDeck = () => {
  const name = document.getElementById('deck-name').value.trim();
  if(!name) return toast('Give your deck a name');
  state.decks.unshift({ id:uid('deck'), starter:false, archived:false, name, description:document.getElementById('deck-desc').value.trim(), createdAt:Date.now(), updatedAt:Date.now(), files:[], cards:[] });
  save();
  render();
};

window.showPasteText = () => {
  app.innerHTML = `<div class="card"><div class="h1">Paste Text</div><div class="small" style="margin-top:6px">Generate concise study cards focused on definitions, key concepts, and facts.</div><div style="height:12px"></div><input id="paste-name" placeholder="New deck name"><textarea id="paste-body" placeholder="Paste your notes here"></textarea><div class="grid2"><button class="btn" onclick="processPastedText()">Create Draft Cards</button><button class="btn secondary" onclick="navigate('decks')">Cancel</button></div></div>`;
};
window.processPastedText = async () => {
  const text = document.getElementById('paste-body').value.trim();
  if(!text) return toast('Paste some text first');
  const result = await generateStudyCards(text);
  showDraftReview({ name:document.getElementById('paste-name').value.trim() || 'Imported Notes', source:'Pasted text', ...result, targetDeckId:null, fileMeta:null });
};

window.showImportDeck = (targetId='') => {
  app.innerHTML = `<div class="card"><div class="h1">Import from File</div><div class="small" style="margin-top:6px">Links are kept as references only and never auto-opened.</div><div style="height:12px"></div>${targetId?'':'<input id="import-name" placeholder="New deck name">'}<input id="file-input" type="file" accept=".pdf,.txt,.docx,.md,.csv,.text"><div class="grid2" style="margin-top:12px"><button class="btn" onclick="processFile('${targetId}')">Create Draft Cards</button><button class="btn secondary" onclick="navigate('decks')">Cancel</button></div></div>`;
};
window.processFile = async (targetId='') => {
  const file = document.getElementById('file-input').files[0];
  if(!file) return toast('Choose a file first');
  try {
    const text = await readFileText(file);
    const result = await generateStudyCards(text || '');
    const name = targetId ? (findDeck(targetId)?.name || 'Imported Deck') : (document.getElementById('import-name')?.value.trim() || file.name.replace(/\.[^.]+$/, ''));
    showDraftReview({ name, source:file.name, ...result, targetDeckId:targetId || null, fileMeta:{ id:uid('file'), name:file.name, type:file.type || file.name.split('.').pop().toUpperCase(), importedAt:Date.now(), archived:false } });
  } catch (e) {
    toast(e.message || 'Could not process file');
  }
};

function showDraftReview({ name, source, summary, keyConcepts=[], cards, references, fallbackText, targetDeckId, fileMeta }){
  const rows = cards.length ? cards : [{front:'What is the main idea?', back:'Edit this card manually.'}];
  app.innerHTML = `<div class="card"><div class="space"><div><div class="h1">Review Draft Cards</div><div class="small">${esc(source)} · ${rows.length} drafts</div></div><button class="btn secondary inline" onclick="navigate('decks')">Close</button></div><div style="height:12px"></div><div class="panel"><div class="h3">Summary</div><div class="small" style="margin-top:8px">${esc(summary)}</div>${keyConcepts.length?`<div style="margin-top:8px" class="tiny"><strong>Key concepts:</strong> ${keyConcepts.slice(0,10).map(esc).join(', ')}</div>`:''}${references.length?`<div style="margin-top:8px" class="tiny">${references.map(esc).join('<br>')}</div>`:''}</div><div style="height:12px"></div><input id="draft-name" value="${esc(name).replace(/"/g,'&quot;')}"><div id="draft-list" class="list" style="margin-top:12px">${rows.map((r,i)=>`<div class="panel" data-row="${i}"><div class="small">Draft ${i+1}</div><input class="draft-front" value="${esc(r.front).replace(/"/g,'&quot;')}"><textarea class="draft-back">${esc(r.back)}</textarea><button class="btn ghost inline" onclick="removeDraft(this)">Delete</button></div>`).join('')}</div><div style="height:12px"></div><button class="btn secondary" onclick="addDraft()">Add Card</button><div style="height:8px"></div><button class="btn" onclick='saveDrafts(${JSON.stringify(targetDeckId || '')}, ${JSON.stringify(fileMeta)}, ${JSON.stringify(fallbackText || '')})'>${targetDeckId ? 'Save to Deck' : 'Create Deck and Save'}</button></div>`;
}

window.addDraft = () => {
  document.getElementById('draft-list').insertAdjacentHTML('beforeend', `<div class="panel" data-row="x"><div class="small">Draft</div><input class="draft-front" placeholder="Front"><textarea class="draft-back" placeholder="Back"></textarea><button class="btn ghost inline" onclick="removeDraft(this)">Delete</button></div>`);
};
window.removeDraft = btn => btn.closest('[data-row]').remove();
window.saveDrafts = (targetId, fileMeta, fallbackText) => {
  let rows = [...document.querySelectorAll('[data-row]')].map(r => ({ front:r.querySelector('.draft-front').value.trim(), back:r.querySelector('.draft-back').value.trim() })).filter(r => r.front && r.back);
  if(!rows.length && fallbackText) rows = [{ front:'What does this file cover?', back:fallbackText.slice(0,120) }];
  if(!rows.length) return toast('Keep at least one complete card');

  let deck;
  if(targetId){ deck = state.decks.find(d => d.id === targetId); }
  else {
    deck = { id:uid('deck'), starter:false, archived:false, name:document.getElementById('draft-name').value.trim() || 'Imported Deck', description:'Created from imported content', createdAt:Date.now(), updatedAt:Date.now(), files:[], cards:[] };
    state.decks.unshift(deck);
  }
  if(!deck) return toast('That deck is not editable');
  rows.forEach(r => deck.cards.push({ id:uid('card'), front:r.front, back:r.back, archived:false, stats:defaultCardStats() }));
  if(fileMeta) deck.files.unshift(fileMeta);
  save();
  openDeck(deck.id);
};

window.openDeck = id => {
  const d = findDeck(id);
  if(!d) return render();
  const editable = canEdit(d);
  app.innerHTML = `<div class="card"><div class="space"><div><div class="h1">${esc(d.name)}</div><div class="small">${esc(d.description || '')}</div></div><button class="btn secondary inline" onclick="navigate('decks')">Back</button></div><div style="height:12px"></div><div class="row wrap"><button class="btn inline" onclick="startStudy('${d.id}','flashcard')">Flashcards</button><button class="btn secondary inline" onclick="startStudy('${d.id}','quiz')">Quiz</button><button class="btn ghost inline" onclick="startStudy('${d.id}','typed')">Type Answer</button><button class="btn ghost inline" onclick="startStudy('${d.id}','matching')">Matching Game</button></div>${editable?`<div style="height:8px"></div><div class="grid2"><button class="btn secondary" onclick="showImportDeck('${d.id}')">Import File</button><button class="btn ghost" onclick="showAddCard('${d.id}')">Add Card</button></div>`:''}${!d.archived?`<div style="height:8px"></div><button class="btn warning" onclick="archiveDeck('${d.id}')">Archive Deck</button>`:''}<div style="height:12px"></div><div class="h2">Cards</div><div class="list" style="margin-top:10px">${activeCards(d).map(c=>`<div class="panel"><div class="space"><div class="h3">${esc(c.front)}</div><div class="row"><button class="btn secondary inline" onclick='speakText(${JSON.stringify(c.front)})'>🔊 Front</button><button class="btn secondary inline" onclick='speakText(${JSON.stringify(c.back)})'>🔊 Back</button>${editable?`<button class="btn danger inline" onclick="deleteCard('${d.id}','${c.id}')">Delete</button>`:''}</div></div><div class="small" style="margin-top:6px">${esc(c.back)}</div></div>`).join('') || '<div class="empty">No cards yet.</div>'}</div></div>`;
};

window.showAddCard = id => app.innerHTML = `<div class="card"><div class="h1">Add Cards Manually</div><input id="card-front" placeholder="Front of card"><textarea id="card-back" placeholder="Back of card"></textarea><div class="grid2"><button class="btn" onclick="addCard('${id}')">Save</button><button class="btn secondary" onclick="openDeck('${id}')">Cancel</button></div></div>`;
window.addCard = id => {
  const d = state.decks.find(x => x.id === id);
  if(!d) return;
  const front = document.getElementById('card-front').value.trim();
  const back = document.getElementById('card-back').value.trim();
  if(!front || !back) return toast('Add text to both sides');
  d.cards.push({ id:uid('card'), front, back, archived:false, stats:defaultCardStats() });
  save();
  openDeck(id);
};

window.startStudy = (id, mode='flashcard', resume='') => {
  const d = findDeck(id);
  if(!d || !activeCards(d).length) return toast('This deck has no cards yet');
  if(mode === 'quiz' && state.sessions.quizLocks?.[id]){
    toast('Quiz locked. Review all flashcards first.');
    return window.startStudy(id, 'flashcard');
  }
  const base = activeCards(d);
  const shouldForceFullDeck = mode === 'flashcard' && state.sessions.forcedReviewDeckId === id;
  const dueOrAll = shouldForceFullDeck ? base.slice() : (dueCards(d).length ? dueCards(d) : base.slice());
  const cards = (!shouldForceFullDeck && resume && state.sessions.recent?.remaining?.length) ? state.sessions.recent.remaining.map(cid => base.find(c => c.id === cid)).filter(Boolean) : dueOrAll;
  const preparedCards = mode === 'quiz' ? shuffle(cards) : cards;
  if(mode === 'matching'){
    const terms = preparedCards.slice(0, Math.min(8, preparedCards.length)).map(c => ({ id:c.id, text:c.front, answer:c.back }));
    const answers = shuffle(terms).map(t => ({ id:t.id, text:t.answer }));
    study = { cards:terms, index:0, flipped:false, mode, options:[], quiz:{ answered:false, selectedIndex:null, correctIndex:-1, correct:false, lastCorrectIndex:null }, typed:{ submitted:false, correct:false, userAnswer:'', correctAnswer:'' }, matching:{ terms, answers, selectedTerm:null, matched:{}, feedback:null, mistakes:0, totalMatches:terms.length, locked:false }, results:{studied:0, correct:0, xp:0, points:0, unlocks:[], mistakes:0} };
  } else {
    study = { cards:preparedCards, index:0, flipped:false, mode, options:[], quiz:{ answered:false, selectedIndex:null, correctIndex:-1, correct:false, lastCorrectIndex:null }, typed:{ submitted:false, correct:false, userAnswer:'', correctAnswer:'' }, results:{studied:0, correct:0, xp:0, points:0, unlocks:[], mistakes:0} };
  }
  state.sessions.recent = { deckId:id, mode, remaining:preparedCards.map(c => c.id) };
  save();
  renderStudyCard();
};
function renderStudyCard(){
  const d = findDeck(state.sessions.recent?.deckId || '');
  const c = study.cards[study.index];
  if(!d) return renderStudyHub();
  if(!c) return renderStudyComplete(d);

  if(study.mode === 'matching'){
    const matchedCount = Object.keys(study.matching.matched).length;
    if(matchedCount >= study.matching.totalMatches) return renderStudyComplete(d);
    app.innerHTML = renderMatchingGamePage({ deckName:d.name, index:matchedCount, total:study.matching.totalMatches, matching:study.matching });
    study.matching.terms.forEach(t => {
      const btn = document.getElementById(`match-term-${t.id}`);
      if(btn) btn.onclick = () => selectMatchingTerm(t.id);
    });
    study.matching.answers.forEach(a => {
      const btn = document.getElementById(`match-answer-${a.id}`);
      if(btn) btn.onclick = () => selectMatchingAnswer(a.id);
    });
    return;
  }
  if(study.mode === 'quiz'){
    if(!study.options.length) study.options = makeQuizOptions(d, c, study.quiz.lastCorrectIndex);
    if(study.quiz.correctIndex < 0) study.quiz.correctIndex = study.options.findIndex(o => o.correct);
    app.innerHTML = renderStudyCardPage({ deckName:d.name, index:study.index+1, total:study.cards.length, mode:'quiz', text:c.front, options:study.options, showAudio:true, quizState:study.quiz });
    study.options.forEach((o, i) => {
      const btn = document.getElementById(`quiz-opt-${i}`);
      if(btn) btn.onclick = () => answerQuiz(c.id, i);
    });
    return;
  }
  if(study.mode === 'typed'){
    app.innerHTML = renderStudyCardPage({ deckName:d.name, index:study.index+1, total:study.cards.length, mode:'typed', text:c.front, options:[], showAudio:true, typedState:study.typed });
    if(!study.typed.submitted){
      const input = document.getElementById('typed-answer-input');
      if(input){
        input.focus();
        input.addEventListener('keydown', e => {
          if(e.key === 'Enter') window.submitTypedAnswer();
        });
      }
    }
    return;
  }
  app.innerHTML = renderStudyCardPage({ deckName:d.name, index:study.index+1, total:study.cards.length, mode:'Flashcard mode', text:study.flipped ? c.back : c.front, flipped:study.flipped, options:[], showAudio:true });
}
window.speakStudyCard = side => {
  const c = study.cards[study.index];
  if(!c) return;
  if(study.mode === 'flashcard' && side === 'back' && !study.flipped) return toast('Reveal the answer first');
  speakText(side === 'back' ? c.back : c.front);
};
window.selectMatchingTerm = termId => {
  if(study.mode !== 'matching') return;
  if(study.matching.locked) return;
  if(study.matching.matched[termId]) return;
  study.matching.selectedTerm = termId;
  study.matching.feedback = null;
  renderStudyCard();
};
window.selectMatchingAnswer = answerId => {
  if(study.mode !== 'matching') return;
  if(study.matching.locked) return;
  const termId = study.matching.selectedTerm;
  if(!termId) return toast('Select a term first');
  const correct = termId === answerId;
  study.matching.feedback = { termId, answerId, correct };
  if(correct){
    study.matching.locked = true;
    renderStudyCard();
    setTimeout(() => {
      study.matching.matched[termId] = answerId;
      study.matching.terms = study.matching.terms.filter(t => t.id !== termId);
      study.matching.answers = study.matching.answers.filter(a => a.id !== answerId);
      study.results.studied++;
      study.results.correct++;
      study.matching.selectedTerm = null;
      study.matching.feedback = null;
      study.matching.locked = false;
      renderStudyCard();
    }, 220);
    return;
  } else {
    study.matching.mistakes++;
    study.matching.locked = true;
    renderStudyCard();
    setTimeout(() => {
      study.matching.selectedTerm = null;
      study.matching.feedback = null;
      study.matching.locked = false;
      renderStudyCard();
    }, 1300);
    return;
  }
};
window.flipStudyCard = () => { study.flipped = !study.flipped; renderStudyCard(); };
window.rateCard = rating => {
  const c = study.cards[study.index];
  if(!c) return;
  updateCardSchedule(c, rating);
  if(rating === 'hard') study.cards.push(c);
  study.results.studied++;
  const reward = awardSession(state, study.results, 1, false, allDecks, activeCards);
  toast(`+${reward.xp} XP · +${reward.points} points`);
  state.user.daily.studied++;
  state.sessions.recent.remaining = state.sessions.recent.remaining.filter(id => id !== c.id);
  save();
  study.index++; study.flipped = false;
  renderStudyCard();
};
window.answerQuiz = (cardId, selected) => {
  const c = study.cards[study.index];
  if(!c || c.id !== cardId || study.quiz.answered) return;
  const correctIndex = study.quiz.correctIndex >= 0 ? study.quiz.correctIndex : study.options.findIndex(o => o.correct);
  const isCorrect = selected === correctIndex;
  study.quiz = { answered:true, selectedIndex:selected, correctIndex, correct:isCorrect, lastCorrectIndex:correctIndex };
  updateCardSchedule(c, isCorrect ? 'easy' : 'hard');
  study.results.studied++;
  if(isCorrect) study.results.correct++;
  else study.results.mistakes++;
  const reward = awardSession(state, study.results, 1, false, allDecks, activeCards, isCorrect ? {} : { customXp:1, customPoints:1 });
  toast(`${isCorrect ? 'Correct' : 'Incorrect – keep practicing'} · +${reward.xp} XP · +${reward.points} points`);
  state.user.daily.studied++;
  state.sessions.recent.remaining = state.sessions.recent.remaining.filter(id => id !== c.id);
  save();
  renderStudyCard();
  setTimeout(() => {
    if(study.mode === 'quiz' && study.quiz.answered) window.nextQuizQuestion();
  }, 1000);
};
window.submitTypedAnswer = () => {
  if(study.mode !== 'typed' || study.typed.submitted) return;
  const c = study.cards[study.index];
  if(!c) return;
  const typed = document.getElementById('typed-answer-input')?.value || '';
  const normalizedTyped = typed.trim().toLowerCase();
  const normalizedAnswer = String(c.back || '').trim().toLowerCase();
  const isCorrect = !!normalizedTyped && normalizedTyped === normalizedAnswer;
  study.typed = { submitted:true, correct:isCorrect, userAnswer:typed, correctAnswer:c.back };
  updateCardSchedule(c, isCorrect ? 'easy' : 'hard');
  study.results.studied++;
  if(isCorrect) study.results.correct++;
  else study.results.mistakes++;
  const reward = awardSession(state, study.results, 1, false, allDecks, activeCards, isCorrect ? {} : { customXp:1, customPoints:1 });
  toast(`${isCorrect ? 'Correct' : 'Incorrect'} · +${reward.xp} XP · +${reward.points} points`);
  state.user.daily.studied++;
  state.sessions.recent.remaining = state.sessions.recent.remaining.filter(id => id !== c.id);
  save();
  renderStudyCard();
};
window.nextTypedQuestion = () => {
  if(study.mode !== 'typed' || !study.typed.submitted) return;
  study.index++;
  study.typed = { submitted:false, correct:false, userAnswer:'', correctAnswer:'' };
  renderStudyCard();
};
window.nextQuizQuestion = () => {
  if(study.mode !== 'quiz' || !study.quiz.answered) return;
  study.index++;
  study.options = [];
  study.quiz = { answered:false, selectedIndex:null, correctIndex:-1, correct:false, lastCorrectIndex:study.quiz.lastCorrectIndex };
  renderStudyCard();
};
function renderStudyComplete(deck){
  if(study.mode === 'matching'){
    const totalMatches = study.matching.totalMatches;
    const mistakes = study.matching.mistakes;
    const basePoints = totalMatches * 10;
    const finalPoints = Math.max(Math.ceil(basePoints * 0.6), basePoints - mistakes);
    const baseXp = totalMatches * 5 + 10;
    const finalXp = Math.max(Math.ceil(baseXp * 0.7), baseXp - mistakes * 2);
    const reward = awardSession(state, study.results, 0, true, allDecks, activeCards, { customXp:finalXp, customPoints:finalPoints });
    toast(`+${reward.xp} XP · +${reward.points} points`);
    save();
    app.innerHTML = `<div class="card"><div class="h1">Session complete</div><div class="small" style="margin-top:6px">Nice work.</div><div class="grid2" style="margin-top:12px"><div class="panel"><div class="small">Total matches</div><div class="h1">${totalMatches}</div></div><div class="panel"><div class="small">Mistakes</div><div class="h1">${mistakes}</div></div><div class="panel"><div class="small">Final XP gained</div><div class="h1">+${study.results.xp}</div></div><div class="panel"><div class="small">Final points earned</div><div class="h1">+${study.results.points}</div></div></div><div style="height:12px"></div><div class="grid2"><button class="btn" onclick="startStudy('${deck.id}','${study.mode}')">Study Again</button><button class="btn secondary" onclick="navigate('home')">Back Home</button></div></div>`;
    return;
  } else {
    awardSession(state, study.results, 0, true, allDecks, activeCards);
  }
  if(study.mode === 'flashcard' && state.sessions.forcedReviewDeckId === deck.id){
    state.sessions.forcedReviewDeckId = null;
    state.sessions.quizLocks = Object.assign({}, state.sessions.quizLocks, { [deck.id]:false });
    toast('Great review. Quiz unlocked.');
  }
  if(study.mode === 'quiz' && study.results.mistakes > 0){
    state.sessions.quizLocks = Object.assign({}, state.sessions.quizLocks, { [deck.id]:true });
    state.sessions.forcedReviewDeckId = deck.id;
    save();
    app.innerHTML = `<div class="card"><div class="h1">Session complete</div><div class="small" style="margin-top:6px">You got a few mistakes. You should review the terminology again.</div><div style="height:12px"></div><div class="grid2"><button class="btn" onclick="startStudy('${deck.id}','flashcard')">Review Flashcards</button><button class="btn secondary" onclick="navigate('study')">Back to Study</button></div></div>`;
    return;
  }
  save();
  app.innerHTML = `<div class="card"><div class="h1">Session complete</div><div class="small" style="margin-top:6px">Nice work.</div><div class="grid2" style="margin-top:12px"><div class="panel"><div class="small">XP gained</div><div class="h1">+${study.results.xp}</div></div><div class="panel"><div class="small">Points earned</div><div class="h1">+${study.results.points}</div></div></div><div style="height:12px"></div><div class="grid2"><button class="btn" onclick="startStudy('${deck.id}','${study.mode}')">Study Again</button><button class="btn secondary" onclick="navigate('home')">Back Home</button></div></div>`;
}

window.buyItem = id => {
  const item = ITEMS.find(i => i.id === id);
  if(!item || state.pet.inventory.includes(id)) return;
  if(state.user.points < item.price){
    shopError = 'Not enough points';
    toast('Not enough points');
    render();
    return;
  }
  shopError = '';
  state.user.points -= item.price;
  state.pet.inventory.push(id);
  state.pet.items.push({ item_id:id, item_type:toItemType(item), is_equipped:false });
  save();
  toast(`${item.name} purchased`);
  render();
};
window.equipItem = id => {
  const item = ITEMS.find(i => i.id === id);
  if(!item || !state.pet.inventory.includes(id)) return;
  const itemType = toItemType(item);
  state.pet.items.forEach(entry => {
    if(entry.item_type === itemType) entry.is_equipped = false;
  });
  const selected = state.pet.items.find(entry => entry.item_id === id);
  if(selected){
    selected.is_equipped = true;
    selected.item_type = itemType;
  }
  state.pet.equipped[itemType] = id;
  save();
  render();
};
window.unequipItem = itemType => {
  const normalizedType = itemType === 'face' ? 'accessory' : itemType;
  if(!(normalizedType in state.pet.equipped)) return;
  const equippedId = state.pet.equipped[normalizedType];
  const selected = state.pet.items.find(entry => entry.item_id === equippedId);
  if(selected) selected.is_equipped = false;
  state.pet.equipped[normalizedType] = null;
  save();
  render();
};
window.feedPet = () => {
  if(state.user.points < FEED_COST) return toast('Not enough points to feed');
  state.user.points -= FEED_COST;
  const moodIndex = MOOD_STEPS.indexOf(state.pet.mood);
  state.pet.mood = MOOD_STEPS[Math.min(MOOD_STEPS.length - 1, Math.max(0, moodIndex) + 1)];
  state.pet.lastFedAt = Date.now();
  state.pet.lastMoodAt = Date.now();
  save();
  toast('Pet fed. Mood improved!');
  render();
};
window.archiveDeck = id => {
  const d = allDecks().find(x => x.id === id);
  if(!d) return;
  d.archived = true;
  save();
  route = 'decks';
  showArchive = true;
  toast('Deck archived');
  render();
};
window.restoreDeck = id => {
  const d = allDecks().find(x => x.id === id);
  if(!d) return;
  d.archived = false;
  save();
  toast('Deck restored');
  render();
};
window.deleteDeckPermanently = id => {
  const d = allDecks().find(x => x.id === id);
  if(!d || !d.archived) return;
  if(!window.confirm('Delete this deck permanently?')) return;
  state.decks = state.decks.filter(x => x.id !== id);
  state.starterDecks = state.starterDecks.filter(x => x.id !== id);
  save();
  toast('Deck deleted');
  render();
};
window.deleteCard = (deckId, cardId) => {
  const d = state.decks.find(x => x.id === deckId);
  if(!d) return;
  if(!window.confirm('Delete this flashcard?')) return;
  d.cards = d.cards.filter(c => c.id !== cardId);
  save();
  toast('Flashcard deleted');
  openDeck(deckId);
};
window.speakText = text => {
  const synth = window.speechSynthesis;
  if(!synth || typeof SpeechSynthesisUtterance === 'undefined'){
    toast('Audio not available');
    return;
  }
  synth.cancel();
  const utter = new SpeechSynthesisUtterance(String(text || '').trim());
  if(!utter.text) return;
  synth.speak(utter);
};

render();
