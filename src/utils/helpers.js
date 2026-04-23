export const uid = p => `${p}-${Math.random().toString(36).slice(2,10)}`;
export const esc = s => String(s || '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
export const today = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString().slice(0,10);
};
export const addDays = (dateStr, n) => {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + n);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString().slice(0,10);
};
export const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
export const shorten = (s, n) => clean(s).length > n ? `${clean(s).slice(0, n - 1).trim()}…` : clean(s);
export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
export const normalizeAnswerText = s => String(s || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[?!.,]/g, '')
  .replace(/\s+/g, ' ')
  .trim();
