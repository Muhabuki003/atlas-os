// Atlas OS — Agent workflow pipeline UI

const STAGES = ['research', 'business', 'architect', 'developer', 'marketing'];

let _items = [];
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

async function _fetchPipeline() {
  try {
    const res = await fetch('/api/atlas/pipeline', { credentials: 'same-origin' });
    const data = await res.json();
    _items = Array.isArray(data.items) ? data.items : [];
  } catch (_) {
    _items = [];
  }
  return _items;
}

function _renderFlow() {
  const flow = _el('atlas-pipeline-flow');
  if (!flow) return;
  flow.innerHTML = STAGES.map((s, i) => `
    <span class="atlas-pipeline-stage" data-stage="${s}">${s}</span>
    ${i < STAGES.length - 1 ? '<span class="atlas-pipeline-arrow" aria-hidden="true">→</span>' : ''}
  `).join('');
}

function _renderItems() {
  const list = _el('atlas-pipeline-items');
  if (!list) return;
  if (!_items.length) {
    list.innerHTML = '<p class="atlas-panel-empty">No pipeline items yet. Approve a Research report to start.</p>';
    return;
  }
  list.innerHTML = _items.map(item => {
    const stage = item.current_stage || 'research';
    const actions = [];
    if (stage === 'research') actions.push({ a: 'send_to_business', l: 'Send to Business' });
    if (stage === 'business') actions.push({ a: 'send_to_architect', l: 'Send to Architect' });
    if (stage === 'architect') actions.push({ a: 'send_to_developer', l: 'Send to Developer' });
    if (stage === 'developer') actions.push({ a: 'send_to_marketing', l: 'Send to Marketing' });
    return `
      <article class="atlas-pipeline-item" data-pipeline-id="${_esc(item.id)}">
        <header>
          <h4>${_esc(item.title)}</h4>
          <span class="atlas-pipeline-item-stage">${_esc(stage)} · ${_esc(item.status || '')}</span>
        </header>
        <p class="atlas-pipeline-item-meta">Next: ${_esc(item.next_agent || '—')}</p>
        <div class="atlas-pipeline-item-actions">
          <button type="button" class="atlas-pipeline-btn" data-pipeline-action="approve" data-id="${_esc(item.id)}">Approve</button>
          <button type="button" class="atlas-pipeline-btn" data-pipeline-action="revise" data-id="${_esc(item.id)}">Revise</button>
          <button type="button" class="atlas-pipeline-btn" data-pipeline-action="reject" data-id="${_esc(item.id)}">Reject</button>
          ${actions.map(x => `<button type="button" class="atlas-pipeline-btn atlas-pipeline-btn--send" data-pipeline-action="${x.a}" data-id="${_esc(item.id)}">${x.l}</button>`).join('')}
        </div>
      </article>
    `;
  }).join('');

  document.querySelectorAll('.atlas-pipeline-stage').forEach(el => {
    const active = _items.some(i => i.current_stage === el.dataset.stage && i.status === 'active');
    el.classList.toggle('atlas-pipeline-stage--active', active);
  });
}

async function _pipelineAction(id, action) {
  const res = await fetch(`/api/atlas/pipeline/${id}/action`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  });
  const data = await res.json();
  if (_deps.showToast) _deps.showToast(data.message || (data.ok ? 'Updated' : 'Failed'));
  if (data.items) _items = data.items;
  _renderItems();
  if (_deps.onPipelineUpdate) _deps.onPipelineUpdate(data);
  return data;
}

function _bindEvents() {
  const wrap = _el('atlas-pipeline-section');
  if (!wrap) return;
  wrap.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-pipeline-action]');
    if (!btn) return;
    _pipelineAction(btn.dataset.id, btn.dataset.pipelineAction);
  });
}

export async function renderPipeline() {
  await _fetchPipeline();
  _renderFlow();
  _renderItems();
}

export function initAtlasPipeline(deps = {}) {
  _deps = deps;
  _bindEvents();
}

const atlasPipelineModule = {
  initAtlasPipeline,
  renderPipeline,
};

export default atlasPipelineModule;
