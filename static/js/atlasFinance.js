// Atlas OS — Finance (personal + project)

let _finance = { entries: [], notes: '' };
let _personal = {};
let _overview = {};
let _projects = [];
let _tab = 'personal';
let _deps = {};

function _el(id) {
  return document.getElementById(id);
}

function _esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _fmt(n) {
  const v = Number(n) || 0;
  return '£' + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function _fetchAll() {
  const [finRes, ovRes, projRes] = await Promise.all([
    fetch('/api/atlas/finance', { credentials: 'same-origin' }),
    fetch('/api/atlas/finance/overview', { credentials: 'same-origin' }),
    fetch('/api/atlas/projects', { credentials: 'same-origin' }),
  ]);
  _finance = await finRes.json();
  const ov = await ovRes.json();
  _overview = ov.overview || {};
  _personal = ov.personal || {};
  const proj = await projRes.json();
  _projects = proj.projects || [];
}

function _renderOverviewCards() {
  const wrap = _el('atlas-finance-overview-cards');
  if (!wrap) return;
  if (_tab === 'personal') {
    const o = _overview;
    wrap.innerHTML = `
      <div class="atlas-finance-card"><span class="atlas-finance-card-label">Due this week</span><span class="atlas-finance-card-value">${_fmt(o.weekly_due)}</span></div>
      <div class="atlas-finance-card"><span class="atlas-finance-card-label">Due this month</span><span class="atlas-finance-card-value">${_fmt(o.monthly_due)}</span></div>
      <div class="atlas-finance-card"><span class="atlas-finance-card-label">Week gross</span><span class="atlas-finance-card-value">${_fmt(o.weekly_gross)}</span></div>
      <div class="atlas-finance-card atlas-finance-card--profit"><span class="atlas-finance-card-label">Week net</span><span class="atlas-finance-card-value">${_fmt(o.weekly_net)}</span></div>
    `;
    if (o.days_until_rent != null) {
      wrap.insertAdjacentHTML('beforeend', `<div class="atlas-finance-card"><span class="atlas-finance-card-label">Days until rent</span><span class="atlas-finance-card-value">${o.days_until_rent}</span></div>`);
    }
  } else {
    const entries = _finance.entries || [];
    const expected = entries.reduce((s, e) => s + (Number(e.expected_revenue) || 0), 0);
    const actual = entries.reduce((s, e) => s + (Number(e.actual_revenue) || 0), 0);
    const costs = entries.reduce((s, e) => s + (Number(e.costs) || 0), 0);
    wrap.innerHTML = `
      <div class="atlas-finance-card"><span class="atlas-finance-card-label">Expected Revenue</span><span class="atlas-finance-card-value">${_fmt(expected)}</span></div>
      <div class="atlas-finance-card"><span class="atlas-finance-card-label">Actual Revenue</span><span class="atlas-finance-card-value">${_fmt(actual)}</span></div>
      <div class="atlas-finance-card"><span class="atlas-finance-card-label">Costs</span><span class="atlas-finance-card-value">${_fmt(costs)}</span></div>
      <div class="atlas-finance-card atlas-finance-card--profit"><span class="atlas-finance-card-label">Profit Estimate</span><span class="atlas-finance-card-value">${_fmt(actual - costs)}</span></div>
    `;
  }
}

function _renderPersonal() {
  const billsEl = _el('atlas-finance-bills-list');
  const weekEl = _el('atlas-finance-week-summary');
  const workEl = _el('atlas-finance-work-list');
  const o = _overview;
  if (weekEl) {
    weekEl.textContent = [
      `Gross ${_fmt(o.weekly_gross)} · Deductions ${_fmt(o.weekly_deductions)} · Net ${_fmt(o.weekly_net)}`,
      `Friday payout target: ${o.friday_payout_date || '—'}`,
      `Last week: ${_fmt(o.last_week_total)} · MTD income: ${_fmt(o.month_to_date_income)}`,
    ].join(' · ');
  }
  if (billsEl) {
    const bills = o.upcoming_bills || [];
    billsEl.innerHTML = bills.length
      ? bills.map(b => `<li>${_esc(b.name)} ${_fmt(b.amount)} — ${b.days_until}d (${_esc(b.next_due_date || '')})</li>`).join('')
      : '<li class="atlas-panel-empty">No upcoming bills</li>';
  }
  if (workEl) {
    const logs = (_personal.work_log || []).slice(-8).reverse();
    workEl.innerHTML = logs.length
      ? logs.map(w => `<li>${_esc(w.date)} · ${_esc(w.type)} · ${_fmt(w.amount)}</li>`).join('')
      : '<li class="atlas-panel-empty">No work days logged</li>';
  }
}

function _renderProjectTable() {
  const tbody = _el('atlas-finance-table-body');
  if (!tbody) return;
  const entries = _finance.entries || [];
  tbody.innerHTML = entries.map(e => `
    <tr data-finance-id="${_esc(e.id)}">
      <td>${_esc(e.name)}</td>
      <td><input type="number" class="atlas-finance-input" data-field="expected_revenue" value="${e.expected_revenue || 0}" min="0" step="1" /></td>
      <td><input type="number" class="atlas-finance-input" data-field="actual_revenue" value="${e.actual_revenue || 0}" min="0" step="1" /></td>
      <td><input type="number" class="atlas-finance-input" data-field="costs" value="${e.costs || 0}" min="0" step="1" /></td>
      <td class="atlas-finance-profit-cell">${_fmt((e.actual_revenue || 0) - (e.costs || 0))}</td>
      <td><button type="button" class="atlas-finance-save-btn" data-save-finance="${_esc(e.id)}">Save</button></td>
    </tr>
  `).join('');
}

function _renderStrategy() {
  const wrap = _el('atlas-finance-strategy');
  const sel = _el('atlas-finance-project-select');
  if (sel) {
    const entries = _finance.entries || [];
    sel.innerHTML = entries.map(e => `<option value="${_esc(e.id)}">${_esc(e.name)}</option>`).join('');
  }
  if (!wrap) return;
  const pid = sel?.value;
  const entries = _finance.entries || [];
  const filtered = pid ? entries.filter(e => e.id === pid) : entries;
  wrap.innerHTML = filtered.map(e => `
    <article class="atlas-finance-strategy-card">
      <h4>${_esc(e.name)}</h4>
      <textarea class="atlas-finance-strategy-input" data-strategy-id="${_esc(e.id)}" rows="3">${_esc(e.monetisation_strategy || '')}</textarea>
      <p class="atlas-finance-notes">${_esc(e.notes || '')}</p>
    </article>
  `).join('');
}

function _setTab(tab) {
  _tab = tab;
  document.querySelectorAll('.atlas-finance-tab').forEach(btn => {
    btn.classList.toggle('atlas-finance-tab--active', btn.dataset.financeTab === tab);
  });
  _el('atlas-finance-personal')?.classList.toggle('hidden', tab !== 'personal');
  _el('atlas-finance-project')?.classList.toggle('hidden', tab !== 'project');
  _renderOverviewCards();
}

async function _saveEntry(id, fields) {
  const res = await fetch('/api/atlas/finance', {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...fields }),
  });
  const data = await res.json();
  if (data.ok) {
    _finance = data.finance;
    _renderOverviewCards();
    _renderProjectTable();
    _renderStrategy();
    if (_deps.showToast) _deps.showToast('Finance updated');
  }
}

async function _runBusinessAgent(action) {
  const pid = _el('atlas-finance-project-select')?.value;
  const res = await fetch('/api/atlas/agents/run', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent_id: 'business', action, project_id: pid || undefined }),
  });
  const data = await res.json();
  if (_deps.showToast) _deps.showToast(data.message || (data.ok ? 'Report queued' : 'Failed'));
}

function _bindEvents() {
  const panel = _el('atlas-finance-panel');
  if (!panel) return;

  panel.querySelectorAll('[data-finance-tab]').forEach(btn => {
    btn.addEventListener('click', () => _setTab(btn.dataset.financeTab));
  });

  _el('atlas-finance-bill-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      name: _el('atlas-finance-bill-name')?.value,
      amount: Number(_el('atlas-finance-bill-amount')?.value) || 0,
      due_day: Number(_el('atlas-finance-bill-due-day')?.value) || 1,
      frequency: 'monthly',
      remind: true,
    };
    await fetch('/api/atlas/finance/bills', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    await _fetchAll();
    _renderPersonal();
    _renderOverviewCards();
    if (_deps.showToast) _deps.showToast('Bill added');
    e.target.reset();
  });

  const workType = _el('atlas-finance-work-type');
  const workAmt = _el('atlas-finance-work-amount');
  workType?.addEventListener('change', () => {
    if (workAmt) workAmt.classList.toggle('hidden', workType.value !== 'Custom');
  });

  _el('atlas-finance-work-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      date: _el('atlas-finance-work-date')?.value || undefined,
      type: workType?.value || 'Full Day',
      amount: workType?.value === 'Custom' ? Number(workAmt?.value) || 0 : undefined,
    };
    await fetch('/api/atlas/finance/work-log', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    await _fetchAll();
    _renderPersonal();
    _renderOverviewCards();
    if (_deps.showToast) _deps.showToast('Work day logged');
  });

  _el('atlas-finance-project-select')?.addEventListener('change', _renderStrategy);
  _el('atlas-finance-ask-business')?.addEventListener('click', () => _runBusinessAgent('business_analysis'));
  _el('atlas-finance-monetisation-plan')?.addEventListener('click', () => _runBusinessAgent('monetisation_plan'));

  panel.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-save-finance]');
    if (!btn) return;
    const id = btn.dataset.saveFinance;
    const row = btn.closest('tr');
    if (!row) return;
    const fields = {};
    row.querySelectorAll('[data-field]').forEach(inp => {
      fields[inp.dataset.field] = Number(inp.value) || 0;
    });
    const strat = panel.querySelector(`[data-strategy-id="${id}"]`);
    if (strat) fields.monetisation_strategy = strat.value;
    await _saveEntry(id, fields);
  });
}

export async function renderFinancePanel() {
  await _fetchAll();
  const dateInput = _el('atlas-finance-work-date');
  if (dateInput && !dateInput.value) dateInput.value = new Date().toISOString().slice(0, 10);
  _setTab(_tab);
  _renderPersonal();
  _renderProjectTable();
  _renderStrategy();
}

export function initAtlasFinance(deps = {}) {
  _deps = deps;
  _bindEvents();
}

const atlasFinanceModule = {
  initAtlasFinance,
  renderFinancePanel,
};

export default atlasFinanceModule;
