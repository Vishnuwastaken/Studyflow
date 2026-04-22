import { uid, today } from '../utils/helpers.js';

export const STORAGE = 'studyflow_phase3_modular';

export const STARTERS = [
  {id:'starter-spanish', starter:true, name:'Spanish Basics', description:'Core beginner vocabulary.', cards:[
    ['Hola','Hello'], ['Gracias','Thank you'], ['Por favor','Please'], ['¿Cómo estás?','How are you?'], ['Buenos días','Good morning'], ['Agua','Water'], ['Comida','Food'], ['¿Dónde está el baño?','Where is the bathroom?']
  ]},
  {id:'starter-biology', starter:true, name:'Biology Fundamentals', description:'Cells, genetics, and core biology.', cards:[
    ['What is the basic unit of life?','The cell.'], ['What does DNA stand for?','Deoxyribonucleic acid.'], ['What organelle is the powerhouse of the cell?','The mitochondrion.'], ['What process do plants use to make food?','Photosynthesis.'], ['What is homeostasis?','Maintaining a stable internal environment.'], ['What carries genetic information?','Genes made of DNA.']
  ]},
  {id:'starter-capitals', starter:true, name:'World Capitals', description:'Popular country and capital pairs.', cards:[
    ['Capital of France','Paris'], ['Capital of Japan','Tokyo'], ['Capital of Brazil','Brasília'], ['Capital of Canada','Ottawa'], ['Capital of Australia','Canberra'], ['Capital of Kenya','Nairobi'], ['Capital of Egypt','Cairo']
  ]}
];

export const ITEMS = [
  {id:'hat_sun', item_id:'hat_sun', name:'Sunny Hat', category:'hat', item_type:'hat', price:60, icon:'🎩'},
  {id:'glasses_round', item_id:'glasses_round', name:'Round Glasses', category:'face', item_type:'accessory', price:120, icon:'👓'},
  {id:'color_mint', item_id:'color_mint', name:'Mint Color', category:'color', item_type:'color', price:80, icon:'🟢', color:'#9fe6c1'},
  {id:'color_peach', item_id:'color_peach', name:'Peach Color', category:'color', item_type:'color', price:150, icon:'🟠', color:'#ffc89e'}
];

export const defaultCardStats = () => ({easy:0, medium:0, hard:0, reviews:0, mastered:false, nextReview:today(), interval:0, ease:2.5, lapses:0});

const seedDeck = t => ({
  id:t.id, starter:true, archived:false, name:t.name, description:t.description, createdAt:Date.now(), updatedAt:Date.now(), files:[],
  cards:t.cards.map(c => ({ id:uid('card'), front:c[0], back:c[1], archived:false, stats:defaultCardStats() }))
});

export const createDefaultState = () => ({
  user:{ daily:{date:today(), studied:0}, streak:{current:0,lastStudyDate:null}, points:0, achievements:{streak3:false,cards50:false,masterDeck:false} },
  pet:{ name:'Pebble', level:1, xp:0, mood:'calm', lastMoodAt:Date.now(), lastFedAt:Date.now(), inventory:[], items:[], equipped:{hat:null,accessory:null,color:null} },
  starterDecks: STARTERS.map(seedDeck),
  decks: [],
  sessions:{recent:null, quizLocks:{}, forcedReviewDeckId:null}
});

export const normalizeDeck = d => ({
  id:d.id || uid('deck'), starter:!!d.starter, archived:!!d.archived, name:d.name || 'Untitled Deck', description:d.description || '',
  createdAt:d.createdAt || Date.now(), updatedAt:d.updatedAt || Date.now(),
  files:(d.files || []).map(f => ({id:f.id || uid('file'), name:f.name || 'Imported file', type:f.type || 'File', importedAt:f.importedAt || Date.now(), archived:!!f.archived})),
  cards:(d.cards || []).map(c => ({id:c.id || uid('card'), front:c.front || '', back:c.back || '', archived:!!c.archived, stats:Object.assign(defaultCardStats(), c.stats || {})}))
});
