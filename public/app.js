function authHeaders() {
  const token = localStorage.getItem('auth_token');
  return token ? { 'Authorization': 'Bearer ' + token } : {};
}

const api = {
  async get(url) {
    const r = await fetch(url, { headers: { ...authHeaders() } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  },
  async post(url, body) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  },
  async put(url, body) {
    const r = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  },
  async del(url) {
    const r = await fetch(url, { method: 'DELETE', headers: { ...authHeaders() } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }
};

// Currency formatter (Brazilian Real)
const brl = (n) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n || 0));
function parseBRL(str) {
  if (str == null) return null;
  const s = String(str).replace(/\s/g, '')
    .replace(/R\$/i, '')
    .replace(/\./g, '')
    .replace(/,/g, '.');
  const num = Number(s);
  return isNaN(num) ? null : num;
}
function attachBRLMask(input) {
  if (!input) return;
  input.addEventListener('blur', () => {
    const val = parseBRL(input.value);
    input.value = val != null ? brl(val) : '';
  });
}

// Live mask while typing
function debounce(fn, ms) {
  let t;
  return function(...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
  };
}
function enableBRLLive(input) {
  if (!input) return;
  let internal = false;
  const handler = debounce(() => {
    if (internal) return;
    const digits = String(input.value).replace(/\D/g, '');
    if (!digits) { input.value = ''; return; }
    const num = Number(digits) / 100;
    internal = true;
    const selEnd = input.selectionEnd;
    input.value = brl(num);
    // Try to keep caret near the end
    requestAnimationFrame(() => { try { input.selectionEnd = input.value.length; input.selectionStart = input.value.length; } catch {} internal = false; });
    internal = false;
  }, 100);
  input.addEventListener('input', handler);
}

const state = {
  items: new Set(),              // nomes
  details: new Map(),            // nome -> { qty, category }
  // details now also includes unit and price
  purchased: new Set(),          // itens marcados como comprados (apenas UI)
  filter: 'all',                 // 'all' | 'pending' | 'purchased'
  theme: 'light',                // 'light' | 'dark'
  editingId: null,               // id da compra sendo editada
};

const els = {
  input: document.getElementById('itemInput'),
  qtyInput: document.getElementById('qtyInput'),
  catInput: document.getElementById('catInput'),
  addBtn: document.getElementById('addBtn'),
  list: document.getElementById('list'),
  recs: document.getElementById('recs'),
  popular: document.getElementById('popular'),
  saveBtn: document.getElementById('saveBtn'),
  storeInput: document.getElementById('storeInput'),
  totalInput: document.getElementById('totalInput'),
  history: document.getElementById('history'),
  clearBtn: document.getElementById('clearBtn'),
  filterAll: document.getElementById('filterAll'),
  filterPending: document.getElementById('filterPending'),
  filterPurchased: document.getElementById('filterPurchased'),
  themeToggle: document.getElementById('themeToggle'),
  exportBtn: document.getElementById('exportBtn'),
  importInput: document.getElementById('importInput'),
  importHistInput: document.getElementById('importHistInput'),
  exportHistBtn: document.getElementById('exportHistBtn'),
  tipsComplements: document.getElementById('tips-complements'),
  tipsSeasonal: document.getElementById('tips-seasonal'),
  tipsReplenishment: document.getElementById('tips-replenishment'),
  chatMessages: document.getElementById('chatMessages'),
  chatInput: document.getElementById('chatInput'),
  chatSend: document.getElementById('chatSend'),
  unitInput: document.getElementById('unitInput'),
  priceInput: document.getElementById('priceInput'),
  priceInsights: document.getElementById('priceInsights'),
  // Modal auth elements
  authOpenBtn: document.getElementById('authOpenBtn'),
  authModal: document.getElementById('authModal'),
  // Register modal elements
  registerModal: document.getElementById('registerModal'),
  openRegister: document.getElementById('openRegister'),
  registerClose: document.getElementById('registerClose'),
  registerSubmit: document.getElementById('registerSubmit'),
  regEmail: document.getElementById('regEmail'),
  regPassword: document.getElementById('regPassword'),
  backToLogin: document.getElementById('backToLogin'),
  loginErrors: document.getElementById('loginErrors'),
  registerErrors: document.getElementById('registerErrors'),
  authClose: document.getElementById('authClose'),
  authSubmit: document.getElementById('authSubmit'),
  authEmailModal: document.getElementById('authEmailModal'),
  authPasswordModal: document.getElementById('authPasswordModal'),
  logoutBtn: document.getElementById('logoutBtn'),
  authNotice: document.getElementById('authNotice'),
};

function renderList() {
  els.list.innerHTML = '';
  const itemsToShow = Array.from(state.items).filter(name => {
    if (state.filter === 'pending') return !state.purchased.has(name);
    if (state.filter === 'purchased') return state.purchased.has(name);
    return true;
  });
  for (const item of itemsToShow) {
    const li = document.createElement('li');
    li.className = 'flex items-center justify-between py-2';

    const left = document.createElement('div');
    left.className = 'flex items-center gap-3';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'h-4 w-4 accent-primary';
    checkbox.checked = state.purchased.has(item);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) state.purchased.add(item); else state.purchased.delete(item);
      textSpan.className = `capitalize ${checkbox.checked ? 'line-through text-gray-400' : ''}`;
      saveState();
    });

    const dot = document.createElement('span');
    dot.className = 'w-2 h-2 bg-primary rounded-full';

    const textSpan = document.createElement('span');
    textSpan.className = `capitalize ${state.purchased.has(item) ? 'line-through text-gray-400' : ''}`;
    const d = state.details.get(item) || { qty: 1, category: '', unit: '', price: null };
    const parts = [`${d.qty}x ${item}`];
    if (d.unit) parts.push(`(${d.unit})`);
    if (d.price != null) parts.push(`- ${brl(d.price)}`);
    textSpan.textContent = parts.join(' ');

    left.appendChild(checkbox);
    left.appendChild(dot);
    left.appendChild(textSpan);

    if (state.details.has(item) && state.details.get(item).category) {
      const badge = document.createElement('span');
      badge.className = 'text-xs px-2 py-0.5 rounded-full border bg-white/70';
      badge.textContent = state.details.get(item).category;
      left.appendChild(badge);
    }

    const removeBtn = document.createElement('button');
    removeBtn.className = 'text-red-600 hover:underline';
    removeBtn.textContent = 'remover';
    removeBtn.addEventListener('click', () => {
      state.items.delete(item);
      state.purchased.delete(item);
      state.details.delete(item);
      renderList();
      refreshRecs();
      saveState();
    });

    li.appendChild(left);
    li.appendChild(removeBtn);
    els.list.appendChild(li);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[c] || c);
}

function addItem(raw, qty = 1, category = '') {
  const v = String(raw || '').trim().toLowerCase();
  if (!v) return;
  state.items.add(v);
  const q = Math.max(1, Number(qty) || 1);
  const cat = String(category || '').trim();
  const unit = String(els.unitInput?.value || '').trim();
  const price = els.priceInput?.value ? parseBRL(els.priceInput.value) : null;
  state.details.set(v, { qty: q, category: cat, unit: unit || '', price: price });
  els.input.value = '';
  if (els.qtyInput) els.qtyInput.value = '1';
  if (els.catInput) els.catInput.value = '';
  if (els.unitInput) els.unitInput.value = '';
  if (els.priceInput) els.priceInput.value = '';
  renderList();
  refreshRecs();
  saveState();
}

els.addBtn.addEventListener('click', () => addItem(els.input.value, els.qtyInput.value, els.catInput.value));
els.input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addItem(els.input.value, els.qtyInput.value, els.catInput.value);
});

els.clearBtn.addEventListener('click', () => {
  if (state.items.size === 0) return;
  if (!confirm('Limpar todos os itens da lista?')) return;
  state.items = new Set();
  state.purchased = new Set();
  state.details = new Map();
  renderList();
  refreshRecs();
  saveState();
});

async function refreshRecs() {
  try {
    const items = Array.from(state.items).join(',');
    const data = await api.get(`/api/recommendations?items=${encodeURIComponent(items)}&limit=10`);
    renderChips(els.recs, data.items, true);
    refreshTips();
  } catch (e) {
    console.warn('recs error', e);
  }
}

function renderChips(container, list, addable = false) {
  container.innerHTML = '';
  for (const r of list) {
    const btn = document.createElement('button');
    btn.className = 'chip px-3 py-1 rounded-full border bg-gray-50 hover:bg-primary hover:text-white transition text-sm';
    btn.textContent = capitalize(r.item || r);
    if (addable) btn.addEventListener('click', () => { addItem(r.item); });
    container.appendChild(btn);
  }
}

function capitalize(s) { return String(s||'').charAt(0).toUpperCase() + String(s||'').slice(1); }

async function loadPopular() {
  try {
    const data = await api.get('/api/popular?limit=20');
    renderChips(els.popular, data.items.map(i => i.item));
  } catch (e) { console.warn('popular error', e); }
}

async function loadHistory() {
  try {
    const data = await api.get('/api/lists');
    els.history.innerHTML = '';
    for (const b of data.baskets) {
      const div = document.createElement('div');
      div.className = 'border rounded p-3 bg-white/60 backdrop-blur';
      const when = new Date(b.createdAt).toLocaleString();
      const itemsHtml = (b.itemsDetailed && b.itemsDetailed.length)
        ? b.itemsDetailed.map(d => `<span class='px-2 py-0.5 rounded border text-sm capitalize'>${escapeHtml((d.qty||1)+'x '+(d.name||''))}${d.unit?` (${escapeHtml(d.unit)})`:''}${d.price!=null?` - ${brl(d.price)}`:''}${d.category?` <span class='ml-1 text-[10px] px-1 py-0.5 rounded-full border'>${escapeHtml(d.category)}</span>`:''}</span>`).join('')
        : b.items.map(i => `<span class='px-2 py-0.5 rounded border text-sm capitalize'>${escapeHtml(i)}</span>`).join('');
      div.innerHTML = `
        <div class="text-xs text-gray-500">${when}${b.store ? ' • ' + escapeHtml(b.store) : ''}${b.total != null ? ' • ' + brl(b.total) : ''}</div>
        <div class="mt-1 flex flex-wrap gap-2">${itemsHtml}</div>
        <div class="mt-2 flex gap-2">
          <button class="px-2 py-1 rounded border text-sm" data-edit="${b.id}">Editar</button>
          <button class="px-2 py-1 rounded border text-sm text-red-600" data-del="${b.id}">Excluir</button>
        </div>
      `;
      // Edit action
      div.querySelector(`[data-edit="${b.id}"]`).addEventListener('click', () => {
        // Load into current state for editing
        state.items = new Set(b.items);
        state.details = new Map((b.itemsDetailed||[]).map(d => [d.name, { qty: d.qty||1, category: d.category||'', unit: d.unit||'', price: d.price!=null?Number(d.price):null }]));
        state.purchased = new Set();
        els.storeInput.value = b.store || '';
        els.totalInput.value = b.total != null ? String(b.total) : '';
        state.editingId = b.id;
        els.saveBtn.textContent = 'Atualizar compra';
        els.saveBtn.classList.add('bg-amber-600','hover:bg-amber-700');
        els.saveBtn.classList.remove('bg-emerald-600','hover:bg-emerald-700');
        renderList();
        refreshRecs();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        saveState();
      });
      // Delete action
      div.querySelector(`[data-del="${b.id}"]`).addEventListener('click', async () => {
        if (!confirm('Excluir esta compra?')) return;
        try {
          await api.del(`/api/lists/${encodeURIComponent(b.id)}`);
          await loadHistory();
          await loadPopular();
        } catch { alert('Falha ao excluir'); }
      });
      els.history.appendChild(div);
    }
  } catch (e) { console.warn('history error', e); }
}

els.saveBtn.addEventListener('click', async () => {
  if (state.items.size === 0) return alert('Adicione pelo menos 1 item');
  try {
    const body = {
      items: Array.from(state.items),
      itemsDetailed: Array.from(state.items).map(name => ({ name, qty: state.details.get(name)?.qty || 1, category: state.details.get(name)?.category || null, unit: state.details.get(name)?.unit || null, price: state.details.get(name)?.price ?? null })),
      store: els.storeInput.value || null,
      total: els.totalInput.value ? parseBRL(els.totalInput.value) : null
    };
    if (state.editingId) {
      await api.put(`/api/lists/${encodeURIComponent(state.editingId)}`, body);
    } else {
      await api.post('/api/list', body);
    }
    state.items = new Set();
    state.purchased = new Set();
    state.details = new Map();
    state.editingId = null;
    renderList();
    els.storeInput.value = '';
    els.totalInput.value = '';
    await Promise.all([loadHistory(), loadPopular(), refreshRecs()]);
    alert('Compra salva!');
    saveState();
  } catch (e) {
    alert('Erro ao salvar');
  }
});

function saveState() {
  const data = {
    items: Array.from(state.items),
    purchased: Array.from(state.purchased),
    details: Array.from(state.details.entries()),
    filter: state.filter,
    theme: state.theme
  };
  localStorage.setItem('shopping_state', JSON.stringify(data));
}

function loadState() {
  try {
    const raw = localStorage.getItem('shopping_state');
    if (!raw) return;
    const data = JSON.parse(raw);
    if (Array.isArray(data.items)) state.items = new Set(data.items);
    if (Array.isArray(data.purchased)) state.purchased = new Set(data.purchased.filter(i => state.items.has(i)));
    if (Array.isArray(data.details)) state.details = new Map(data.details.filter(([k]) => state.items.has(k)));
    if (data.filter) state.filter = data.filter;
    if (data.theme) state.theme = data.theme;
  } catch {}
}

function applyTheme() {
  const dark = state.theme === 'dark';
  // Tailwind dark utility (if used) and our custom dark-theme class
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.classList.toggle('dark-theme', dark);
  document.body.classList.toggle('bg-slate-900', dark);
  document.body.classList.toggle('text-white', dark);
  for (const el of document.querySelectorAll('[data-card]')) {
    el.classList.toggle('bg-white/70', !dark);
    el.classList.toggle('bg-slate-800/60', dark);
    el.classList.toggle('border-white/60', !dark);
    el.classList.toggle('border-slate-700', dark);
    el.classList.toggle('text-white', dark);
  }
}

// Filters
function setFilter(f) {
  state.filter = f;
  for (const el of [els.filterAll, els.filterPending, els.filterPurchased]) el.classList.remove('bg-white/70');
  if (f === 'all') els.filterAll.classList.add('bg-white/70');
  if (f === 'pending') els.filterPending.classList.add('bg-white/70');
  if (f === 'purchased') els.filterPurchased.classList.add('bg-white/70');
  renderList();
  saveState();
}

els.filterAll.addEventListener('click', () => setFilter('all'));
els.filterPending.addEventListener('click', () => setFilter('pending'));
els.filterPurchased.addEventListener('click', () => setFilter('purchased'));

// Theme toggle
els.themeToggle.addEventListener('click', () => {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  applyTheme();
  saveState();
});

// Export/Import
els.exportBtn.addEventListener('click', () => {
  const payload = {
    items: Array.from(state.items),
    purchased: Array.from(state.purchased),
    details: Array.from(state.details.entries())
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'lista.json'; a.click();
  URL.revokeObjectURL(url);
});

els.importInput.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (Array.isArray(data.items)) state.items = new Set(data.items);
    if (Array.isArray(data.purchased)) state.purchased = new Set(data.purchased.filter(i => state.items.has(i)));
    if (Array.isArray(data.details)) state.details = new Map(data.details.filter(([k]) => state.items.has(k)));
    renderList();
    refreshRecs();
    saveState();
    alert('Lista importada!');
  } catch {
    alert('Falha ao importar');
  } finally {
    e.target.value = '';
  }
});

async function refreshTips() {
  try {
    const items = Array.from(state.items).join(',');
    const data = await api.get(`/api/tips?items=${encodeURIComponent(items)}`);
    renderChips(els.tipsComplements, (data.complements||[]).map(x => ({ item: x.item })), true);
    renderChips(els.tipsSeasonal, (data.seasonal||[]).map(x => ({ item: x.item })), true);
    renderChips(els.tipsReplenishment, (data.replenishment||[]).map(x => ({ item: x.item })), true);
  } catch (e) { console.warn('tips error', e); }
}

async function loadInsights() {
  try {
    const data = await api.get('/api/insights/prices');
    els.priceInsights.innerHTML = '';
    if (!data.items || !data.items.length) {
      els.priceInsights.textContent = 'Sem dados de preços suficientes.';
      return;
    }
    const table = document.createElement('table');
    table.className = 'w-full text-xs';
    table.innerHTML = `<thead><tr class="text-left"><th class="py-1">Item</th><th class="py-1">Média</th><th class="py-1">Último</th><th class="py-1">Variação</th><th class="py-1">#</th></tr></thead>`;
    const tbody = document.createElement('tbody');
    for (const it of data.items.slice(0, 12)) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="py-1 capitalize">${escapeHtml(it.item)}</td><td class="py-1">${brl(it.avg)}</td><td class="py-1">${brl(it.last)}</td><td class="py-1">${it.change!=null ? it.change.toFixed(2)+'%' : '-'}</td><td class="py-1">${it.count}</td>`;
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    els.priceInsights.appendChild(table);
  } catch (e) {
    els.priceInsights.textContent = 'Não foi possível carregar insights.';
  }
}

// --- Chatbot ---
function appendChat(role, text) {
  if (!els.chatMessages) return;
  const wrap = document.createElement('div');
  wrap.className = role === 'assistant'
    ? 'bg-white/80 border rounded p-2 text-gray-800'
    : 'bg-primary text-white rounded p-2 ml-auto';
  wrap.style.maxWidth = '85%';
  wrap.textContent = text;
  els.chatMessages.appendChild(wrap);
  els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
}

async function sendChat() {
  const msg = (els.chatInput?.value || '').trim();
  if (!msg) return;
  appendChat('user', msg);
  els.chatInput.value = '';
  try {
    const body = { message: msg, items: Array.from(state.items), budget: els.totalInput.value ? Number(els.totalInput.value) : undefined };
    const r = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(body) });
    const data = await r.json();
    if (Array.isArray(data.messages)) {
      for (const m of data.messages) appendChat(m.role || 'assistant', m.text);
    } else if (data.error) {
      appendChat('assistant', 'Desculpe, não consegui processar agora.');
    }
  } catch (e) {
    appendChat('assistant', 'Falha ao conectar ao chatbot.');
  }
}

if (els.chatSend) els.chatSend.addEventListener('click', sendChat);
if (els.chatInput) els.chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });

// Initial
loadState();
applyTheme();
renderList();

// Auth wiring
function updateAuthUI() {
  const token = localStorage.getItem('auth_token');
  const logged = !!token;
  if (els.logoutBtn) els.logoutBtn.classList.toggle('hidden', !logged);
  if (els.authOpenBtn) els.authOpenBtn.classList.toggle('hidden', logged);
  if (els.authNotice) els.authNotice.textContent = logged ? 'Autenticado' : 'Faça login para carregar seu histórico';
}

async function doLogin(email, password) {
  const res = await api.post('/api/login', { email, password });
  localStorage.setItem('auth_token', res.token);
}
async function doRegister(email, password) {
  const res = await api.post('/api/register', { email, password });
  localStorage.setItem('auth_token', res.token);
}
// Modal auth logic (login-only)
function openAuth() { if (els.authModal) els.authModal.classList.remove('hidden'); }
function closeAuth() { if (els.authModal) els.authModal.classList.add('hidden'); }
if (els.authOpenBtn) els.authOpenBtn.addEventListener('click', () => { openAuth(); });
if (els.authClose) els.authClose.addEventListener('click', closeAuth);
if (els.authSubmit) els.authSubmit.addEventListener('click', async () => {
  try {
    const email = els.authEmailModal.value.trim();
    const pass = els.authPasswordModal.value;
    if (!email || !pass) return alert('Informe email e senha');
    await doLogin(email, pass);
    updateAuthUI();
    closeAuth();
    await Promise.all([loadPopular(), loadHistory(), refreshRecs(), refreshTips(), loadInsights()]);
  } catch {
    alert('Login inválido');
  }
});
// Register modal behavior
function openRegisterModal() { if (els.registerModal) els.registerModal.classList.remove('hidden'); }
function closeRegisterModal() { if (els.registerModal) els.registerModal.classList.add('hidden'); }
if (els.openRegister) els.openRegister.addEventListener('click', () => { closeAuth(); openRegisterModal(); });
if (els.registerClose) els.registerClose.addEventListener('click', closeRegisterModal);
if (els.backToLogin) els.backToLogin.addEventListener('click', () => { closeRegisterModal(); openAuth(); });
if (els.registerSubmit) els.registerSubmit.addEventListener('click', async () => {
  els.registerErrors.classList.add('hidden');
  els.registerErrors.textContent = '';
  const email = (els.regEmail?.value || '').trim();
  const pass = (els.regPassword?.value || '').trim();
  // Inline validation
  const errs = [];
  if (!email || !email.includes('@')) errs.push('Informe um email válido.');
  if (!pass || pass.length < 4) errs.push('A senha deve ter ao menos 4 caracteres.');
  els.regEmail.classList.toggle('border-red-500', !email || !email.includes('@'));
  els.regPassword.classList.toggle('border-red-500', !pass || pass.length < 4);
  if (errs.length) {
    els.registerErrors.textContent = errs.join(' ');
    els.registerErrors.classList.remove('hidden');
    return;
  }
  try {
    const r = await api.post('/api/register', { email, password: pass });
    localStorage.setItem('auth_token', r.token);
    closeRegisterModal();
    updateAuthUI();
    await Promise.all([loadPopular(), loadHistory(), refreshRecs(), refreshTips(), loadInsights()]);
  } catch (e) {
    els.registerErrors.textContent = 'Falha ao registrar. E-mail pode já estar em uso.';
    els.registerErrors.classList.remove('hidden');
  }
});
if (els.logoutBtn) els.logoutBtn.addEventListener('click', async () => {
  localStorage.removeItem('auth_token');
  updateAuthUI();
  els.history.innerHTML = '';
  els.recs.innerHTML = '';
  els.popular.innerHTML = '';
  els.tipsComplements.innerHTML = '';
  els.tipsSeasonal.innerHTML = '';
  els.tipsReplenishment.innerHTML = '';
  els.priceInsights.innerHTML = '';
  openAuth();
});

updateAuthUI();
if (localStorage.getItem('auth_token')) {
  Promise.all([loadPopular(), loadHistory(), refreshRecs(), refreshTips(), loadInsights()]);
}

// Export/Import histórico via API
if (els.exportHistBtn) els.exportHistBtn.addEventListener('click', async () => {
  try {
    const data = await api.get('/api/export');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'historico.json'; a.click();
    URL.revokeObjectURL(url);
  } catch { alert('Falha ao exportar'); }
});
if (els.importHistInput) els.importHistInput.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const payload = JSON.parse(text);
    await api.post('/api/import', payload);
    await loadHistory();
  } catch { alert('Falha ao importar histórico'); }
  finally { e.target.value = ''; }
});

// Open auth on first load if not logged and wire Enter key inside modal
window.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('auth_token');
  if (!token) {
    openAuth();
  }
  if (els.authEmailModal) els.authEmailModal.addEventListener('keydown', (e) => { if (e.key === 'Enter') els.authSubmit?.click(); });
  if (els.authPasswordModal) els.authPasswordModal.addEventListener('keydown', (e) => { if (e.key === 'Enter') els.authSubmit?.click(); });
  if (els.regEmail) els.regEmail.addEventListener('keydown', (e) => { if (e.key === 'Enter') els.registerSubmit?.click(); });
  if (els.regPassword) els.regPassword.addEventListener('keydown', (e) => { if (e.key === 'Enter') els.registerSubmit?.click(); });
  attachBRLMask(els.priceInput);
  attachBRLMask(els.totalInput);
  enableBRLLive(els.priceInput);
  enableBRLLive(els.totalInput);
});
