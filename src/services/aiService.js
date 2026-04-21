import { clean, shorten } from '../utils/helpers.js';
import { extractLinks } from './fileService.js';

const stopWords = new Set('the and for are with this that from your have has into onto over under about when where what which while been being than then they them their there here because each other using used use via per not but can could should would may might'.split(' '));

const sentenceSplit = text => text.split(/(?<=[.!?])\s+/).map(s => clean(s)).filter(Boolean);

const concise = s => shorten(clean(s).replace(/^that\s+/i, ''), 140);
const isGoodAnswer = s => {
  const words = clean(s).split(' ').length;
  return words >= 2 && words <= 24;
};

function pushCard(cards, seen, front, back){
  const q = clean(front).replace(/[.\s]+$/,'');
  const a = concise(back);
  if(!q || !a || !isGoodAnswer(a)) return;
  const key = `${q.toLowerCase()}|${a.toLowerCase()}`;
  if(seen.has(key)) return;
  seen.add(key);
  cards.push({ front:q.endsWith('?') ? q : `${q}?`, back:a });
}

export function generateStudyCards(rawText){
  const text = rawText.replace(/\r/g,'\n').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
  const lines = text.split('\n').map(clean).filter(Boolean);
  const sentences = sentenceSplit(text);
  const cards = [];
  const seen = new Set();

  for(const line of lines){
    const def = line.match(/^(.{2,70}?)\s*[:\-–]\s*(.{8,220})$/);
    if(def) pushCard(cards, seen, `What is ${def[1]}`, def[2]);

    const copula = line.match(/^(.{2,70}?)\s+(?:is|are|means|refers to|defined as)\s+(.{8,220})\.?$/i);
    if(copula) pushCard(cards, seen, `What is ${copula[1]}`, copula[2]);

    const fact = line.match(/^(?:[-*•]|\d+[.)])\s+(.{10,180})$/);
    if(fact){
      const statement = clean(fact[1]);
      const keyTerm = statement.split(' ').slice(0,4).join(' ');
      pushCard(cards, seen, `Key fact about ${keyTerm}`, statement);
    }

    const acronym = line.match(/\b([A-Z][A-Z0-9]{1,8})\b\s*\(([^)]{3,70})\)/);
    if(acronym) pushCard(cards, seen, `What does ${acronym[1]} stand for`, acronym[2]);
  }

  if(cards.length < 8){
    for(const s of sentences){
      if(s.length < 25 || s.length > 170) continue;
      const words = s.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 3 && !stopWords.has(w));
      if(!words.length) continue;
      pushCard(cards, seen, `What is ${words[0]}`, s);
      if(cards.length >= 20) break;
    }
  }

  const links = extractLinks(text);
  const summary = shorten(sentences.slice(0,2).join(' ') || text, 240);
  const safeCards = cards.slice(0, 60);

  return {
    summary,
    cards: safeCards.length ? safeCards : [{ front:'What is the main idea of this file?', back:'Edit this card manually after reviewing extracted text.' }],
    references: links.map(l => `Reference link found: ${l}`),
    fallbackText: text.slice(0, 5000)
  };
}
