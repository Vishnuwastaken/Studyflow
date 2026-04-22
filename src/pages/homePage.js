import { esc } from '../utils/helpers.js';
import { renderPetDisplay, renderProgressBar } from '../components/uiComponents.js';

export function renderHomePage(ctx){
  const { recentDeck, state, petMood, petColor, petEvolutionStage, xpForLevel } = ctx;
  const d = recentDeck();
  const xp = xpForLevel(state.pet.level);
  return `
    <div class="card"><div class="space"><div><div class="h1">Welcome back</div><div class="small">Ready to keep your streak going?</div></div>${renderPetDisplay({color:petColor(), hat:!!state.pet.equipped.hat, glasses:!!state.pet.equipped.accessory, stage:petEvolutionStage()})}</div></div>
    <div class="card"><div class="h2">Continue Studying</div><div class="small" style="margin-top:6px">${d ? esc(d.name) : 'Pick a deck to begin'}</div><button class="btn" style="margin-top:12px" onclick="${d ? `startStudy('${d.id}','flashcard','resume')` : `navigate('study')`}">${d ? 'Resume Last Session' : 'Start Studying'}</button></div>
    <div class="grid2"><div class="card"><div class="small">Daily progress</div><div class="h1" style="margin-top:6px">${state.user.daily.studied} cards</div><div style="height:10px"></div>${renderProgressBar(Math.min(100, state.user.daily.studied * 10))}</div><div class="card"><div class="small">Current streak</div><div class="h1" style="margin-top:6px">${state.user.streak.current} day${state.user.streak.current===1?'':'s'}</div><div class="tiny" style="margin-top:8px">${state.user.points} points</div></div></div>
    <div class="card"><div class="space"><div><div class="h2">${esc(state.pet.name)} · Level ${state.pet.level}</div><div class="small">${petMood()} mood</div></div><button class="btn secondary inline" onclick="navigate('pet')">Pet</button></div><div style="height:12px"></div>${renderProgressBar(Math.round(state.pet.xp / xp * 100))}<div class="tiny" style="margin-top:8px">${state.pet.xp} / ${xp} XP to next level</div></div>
  `;
}
