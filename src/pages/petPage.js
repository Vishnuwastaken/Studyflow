import { esc } from '../utils/helpers.js';
import { renderPetDisplay, renderProgressBar } from '../components/uiComponents.js';

export function renderPetPage(ctx){
  const { state, items, xpForLevel, petMood, petColor, petEvolutionStage, shopError, feedCost, toItemType } = ctx;
  const xp = xpForLevel(state.pet.level);
  const owned = items.filter(i => state.pet.inventory.includes(i.id));
  const shop = items.filter(i => !state.pet.inventory.includes(i.id));
  const itemRow = i => {
    const itemType = toItemType(i);
    const equipped = !!state.pet.items.find(entry => entry.item_id === i.id && entry.is_equipped);
    return `<div class="panel"><div class="space"><div class="row"><div class="icon">${i.icon}</div><div><div class="h3">${esc(i.name)}</div><div class="small">${esc(itemType)}</div>${equipped?'<div class="tiny" style="color:var(--success)">Equipped</div>':''}</div></div>${equipped?`<button class="btn warning inline" onclick="unequipItem('${itemType}')">Remove</button>`:`<button class="btn inline" onclick="equipItem('${i.id}')">Equip</button>`}</div></div>`;
  };
  const shopRow = i => `<div class="panel"><div class="space"><div class="row"><div class="icon">${i.icon}</div><div><div class="h3">${esc(i.name)}</div><div class="small">${i.price} points · ${esc(i.category)}</div></div></div><button class="btn inline" onclick="buyItem('${i.id}')">Buy</button></div></div>`;

  return `<div class="card"><div style="text-align:center"><div class="h1">${esc(state.pet.name)}</div><div class="small">Level ${state.pet.level} · Stage ${petEvolutionStage()}/5 · ${petMood()} mood</div><div class="h3" style="margin-top:8px">${state.user.points} points</div><div style="display:flex;justify-content:center;margin:14px 0">${renderPetDisplay({big:true,color:petColor(),hat:!!state.pet.equipped.hat,glasses:!!state.pet.equipped.accessory,mood:state.pet.mood,stage:petEvolutionStage(),celebrate:(Date.now() - (state.pet.lastLevelUpAt || 0)) < 4000})}</div>${renderProgressBar(Math.round(state.pet.xp / xp * 100))}<div class="tiny" style="margin-top:8px">${state.pet.xp} / ${xp} XP to next level</div><div style="height:12px"></div><button class="btn inline" onclick="feedPet()">Feed Pet (${feedCost} points)</button></div></div><div class="card"><div class="h2">Inventory</div><div style="height:10px"></div>${owned.length?`<div class="list">${owned.map(itemRow).join('')}</div>`:'<div class="empty">Buy an item from the shop below.</div>'}</div><div class="card"><div class="h2">Shop</div>${shopError?`<div class="tiny" style="margin-top:8px;color:var(--danger)">${esc(shopError)}</div>`:''}<div style="height:10px"></div>${shop.length?`<div class="list">${shop.map(shopRow).join('')}</div>`:'<div class="empty">You own everything in the shop.</div>'}</div>`;
}
