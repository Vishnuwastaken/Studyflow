import { esc } from '../utils/helpers.js';
import { renderDeckListComponent, renderProgressBar } from '../components/uiComponents.js';

export function renderDecksPage(ctx){
  const { myDecks, starterDecks, deckProgress, masteredPct, activeCards, dueCards } = ctx;
  const deckCard = d => `<div class="panel"><div class="space"><div><div class="row wrap"><div class="h3">${esc(d.name)}</div>${d.starter?'<span class="badge">Starter</span>':''}</div><div class="small">${activeCards(d).length} cards · ${dueCards(d).length} due today</div></div><button class="btn inline" onclick="openDeck('${d.id}')">Open</button></div><div style="height:10px"></div>${renderProgressBar(deckProgress(d))}<div class="space" style="margin-top:8px"><div class="tiny">${deckProgress(d)}% known</div><div class="tiny">${masteredPct(d)}% mastered</div></div></div>`;

  return `<div class="card"><div class="h1">Decks</div><div class="small" style="margin-top:6px">Create, import, edit, and organize your study material.</div><div style="height:12px"></div><div class="grid3"><button class="btn" onclick="showCreateDeck()">Create Deck</button><button class="btn secondary" onclick="showImportDeck()">Import File</button><button class="btn secondary" onclick="showPasteText()">Paste Text</button></div></div><div class="card"><div class="h2">My Decks</div><div style="height:10px"></div>${renderDeckListComponent(myDecks, deckCard)}</div><div class="card"><div class="h2">Starter Decks</div><div style="height:10px"></div>${renderDeckListComponent(starterDecks, deckCard)}</div>`;
}
