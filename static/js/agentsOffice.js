// Atlas OS — Agents Office operations floor

const POD_LAYOUT = [
  { id: 'developer', pos: 'tl' },
  { id: 'architect', pos: 'tr' },
  { id: 'research', pos: 'ml' },
  { id: 'marketing', pos: 'mr' },
  { id: 'business', pos: 'bc' },
];

const CONTROL_ACTIONS = [
  { id: 'developer_review', label: 'Run Developer Review', agent_id: 'developer', action: 'developer_review' },
  { id: 'research_brief', label: 'Start Research Brief', agent_id: 'research', action: 'research_brief' },
  { id: 'marketing_ideas', label: 'Generate Marketing Ideas', agent_id: 'marketing', action: 'marketing_ideas' },
  { id: 'business_ask', label: 'Ask Business Agent', agent_id: 'business', action: 'business_strategy' },
  { id: 'sync', label: 'Sync Agents', agent_id: 'developer', action: 'sync_agents' },
];

let _deps = {};
let _agents = [];
let _reports = [];
let _queue = { pending: [], waiting_for_approval: [], completed_today: [] };
let _workingAgents = new Set();
let _activeReportId = null;
let _linesRaf = 0;
let _linesRunning = false;

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

function _statusLabel(status) {
  const map = {
    idle: 'Idle',
    ready: 'Ready',
    thinking: 'Working',
    waiting: 'Waiting',
    working: 'Working',
  };
  return map[status] || status;
}

function _statusClass(status) {
  if (status === 'thinking' || status === 'working') return 'working';
  return status || 'idle';
}

function _agentStatus(agent) {
  if (_workingAgents.has(agent.id)) return 'working';
  return agent.status;
}

async function _fetchReports() {
  try {
    const res = await fetch('/api/atlas/reports', { credentials: 'same-origin' });
    if (!res.ok) return;
    const data = await res.json();
    _reports = Array.isArray(data.reports) ? data.reports : [];
    _queue = data.queue || { pending: [], waiting_for_approval: [], completed_today: [] };
  } catch (_) {
    _reports = [];
    _queue = { pending: [], waiting_for_approval: [], completed_today: [] };
  }
}

async function _fetchAgents() {
  try {
    const res = await fetch('/api/atlas/agents', { credentials: 'same-origin' });
    if (!res.ok) return;
    const data = await res.json();
    _agents = Array.isArray(data.agents) ? data.agents : [];
  } catch (_) {
    _agents = [];
  }
}

export async function refreshAgentsOffice() {
  await Promise.all([_fetchAgents(), _fetchReports()]);
  _renderAll();
}

function _setAgentWorking(agentId, working) {
  if (working) _workingAgents.add(agentId);
  else _workingAgents.delete(agentId);
  _renderPods();
  _renderControls();
}

async function _runAction(agentId, action) {
  const btn = document.querySelector(`[data-agent-id="${agentId}"][data-action="${action}"]`);
  if (btn) btn.disabled = true;
  _setAgentWorking(agentId, true);
  try {
    const res = await fetch('/api/atlas/agents/run', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: agentId, action }),
    });
    const data = await res.json();
    if (_deps.showToast) _deps.showToast(data.message || (data.ok ? 'Report ready' : 'Action failed'));
    if (data.agents) _agents = data.agents;
    if (data.report) {
      await _fetchReports();
      _openReport(data.report.id);
    } else {
      await refreshAgentsOffice();
    }
    return data;
  } catch (_) {
    if (_deps.showToast) _deps.showToast('Failed to run agent action');
    return null;
  } finally {
    _setAgentWorking(agentId, false);
    if (btn) btn.disabled = false;
    _renderReports();
    _renderPods();
  }
}

function _renderPods() {
  const wrap = _el('atlas-agents-pods');
  if (!wrap) return;
  const byId = Object.fromEntries(_agents.map(a => [a.id, a]));

  wrap.innerHTML = POD_LAYOUT.map(({ id, pos }) => {
    const a = byId[id];
    if (!a) return '';
    const st = _statusClass(_agentStatus(a));
    return `
      <article class="atlas-agent-pod atlas-agent-pod--${pos}${_workingAgents.has(id) ? ' atlas-agent-pod--working' : ''}" data-agent-id="${_esc(a.id)}">
        <header class="atlas-agent-pod-head">
          <span class="atlas-agent-pod-dept">${_esc(a.department || 'Operations')}</span>
          <span class="atlas-agent-pod-status atlas-agent-pod-status--${_esc(st)}">${_workingAgents.has(id) ? 'Working' : _statusLabel(a.status)}</span>
        </header>
        <h3 class="atlas-agent-pod-name">${_esc(a.name)}</h3>
        <p class="atlas-agent-pod-role">${_esc(a.role || '')}</p>
        <dl class="atlas-agent-pod-meta">
          <div><dt>Current task</dt><dd>${_esc(_workingAgents.has(id) ? 'Generating report…' : (a.current_task || '—'))}</dd></div>
          <div><dt>Last report</dt><dd>${_esc(a.last_report || '—')}</dd></div>
          ${a.waiting_on ? `<div class="atlas-agent-pod-waiting"><dt>Waiting on</dt><dd>${_esc(a.waiting_on)}</dd></div>` : ''}
        </dl>
      </article>
    `;
  }).join('');
}

function _reportItem(r) {
  const title = r.title || r.summary || 'Report';
  const detail = r.summary || r.agent_name || '';
  return `
    <li class="atlas-reports-item" data-report-id="${_esc(r.id)}" role="button" tabindex="0">
      <span class="atlas-reports-agent">${_esc(r.agent_name || r.agent_id || 'Agent')}</span>
      <span class="atlas-reports-detail">${_esc(title)}</span>
      ${detail && detail !== title ? `<span class="atlas-reports-snippet">${_esc(detail)}</span>` : ''}
    </li>
  `;
}

function _fillReportList(elId, items, empty) {
  const el = _el(elId);
  if (!el) return;
  if (!items.length) {
    el.innerHTML = `<li class="atlas-reports-empty">${_esc(empty)}</li>`;
    return;
  }
  el.innerHTML = items.map(_reportItem).join('');
}

function _renderReports() {
  _fillReportList('atlas-reports-pending', _queue.pending || [], 'No pending reports');
  _fillReportList('atlas-reports-approval', _queue.waiting_for_approval || [], 'Nothing awaiting approval');
  _fillReportList('atlas-reports-completed', _queue.completed_today || [], 'No completed reports today');
}

function _renderControls() {
  const bar = _el('atlas-agents-controls');
  if (!bar) return;
  bar.innerHTML = CONTROL_ACTIONS.map(c => {
    const busy = _workingAgents.has(c.agent_id);
    return `
      <button type="button" class="atlas-agents-ctrl-btn" data-agent-id="${_esc(c.agent_id)}" data-action="${_esc(c.action)}"${busy ? ' disabled' : ''}>${_esc(c.label)}</button>
    `;
  }).join('');
}

function _renderAll() {
  _renderPods();
  _renderReports();
  _renderControls();
  requestAnimationFrame(() => {
    if (_linesRunning) _drawConnectionLines();
  });
}

export function renderAgentsOffice(agents = []) {
  if (Array.isArray(agents) && agents.length) _agents = agents;
  _renderAll();
  refreshAgentsOffice();
}

function _formatReportContent(content) {
  const text = String(content || '');
  const escaped = _esc(text);
  return escaped
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

function _findReport(id) {
  return _reports.find(r => r.id === id);
}

function _closeReportModal() {
  const modal = _el('atlas-report-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  _activeReportId = null;
}

function _openReport(reportId) {
  const report = _findReport(reportId);
  if (!report) return;
  _activeReportId = reportId;
  const modal = _el('atlas-report-modal');
  const agentEl = _el('atlas-report-modal-agent');
  const titleEl = _el('atlas-report-modal-title');
  const metaEl = _el('atlas-report-modal-meta');
  const summaryEl = _el('atlas-report-modal-summary');
  const bodyEl = _el('atlas-report-modal-body');
  const actionsEl = _el('atlas-report-modal-actions');
  if (!modal || !titleEl || !bodyEl) return;

  if (agentEl) agentEl.textContent = report.agent_name || report.agent_id || 'Agent';
  titleEl.textContent = report.title || 'Report';
  if (metaEl) {
    const created = report.created_at ? new Date(report.created_at).toLocaleString() : '';
    metaEl.textContent = [report.status?.replace(/_/g, ' '), created].filter(Boolean).join(' · ');
  }
  if (summaryEl) {
    summaryEl.textContent = report.summary || '';
    summaryEl.style.display = report.summary ? '' : 'none';
  }
  bodyEl.innerHTML = _formatReportContent(report.content);

  if (actionsEl) {
    const actions = Array.isArray(report.actions) ? report.actions : [];
    if (report.status === 'waiting_for_review' && actions.length) {
      actionsEl.innerHTML = actions.map(a => `
        <button type="button" class="atlas-report-action-btn atlas-report-action-btn--${_esc(a)}" data-report-action="${_esc(a)}">${_esc(a)}</button>
      `).join('');
      actionsEl.style.display = '';
    } else {
      actionsEl.innerHTML = '';
      actionsEl.style.display = 'none';
    }
  }

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
}

async function _reportAction(action) {
  if (!_activeReportId) return;
  try {
    const res = await fetch(`/api/atlas/reports/${_activeReportId}/action`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    if (_deps.showToast) _deps.showToast(data.message || 'Updated');
    if (data.agents) _agents = data.agents;
    await _fetchReports();
    if (data.report) {
      const idx = _reports.findIndex(r => r.id === data.report.id);
      if (idx >= 0) _reports[idx] = data.report;
      _openReport(data.report.id);
    }
    _renderReports();
    _renderPods();
    if (action === 'approve' && window.atlasPipelineRefresh) window.atlasPipelineRefresh();
    if (action === 'archive') _closeReportModal();
  } catch (_) {
    if (_deps.showToast) _deps.showToast('Report action failed');
  }
}

export function startAgentLines() {
  _linesRunning = true;
  _drawConnectionLines();
}

export function stopAgentLines() {
  _linesRunning = false;
  if (_linesRaf) cancelAnimationFrame(_linesRaf);
  _linesRaf = 0;
  const canvas = _el('atlas-agents-lines');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

function _drawConnectionLines() {
  if (!_linesRunning) return;
  const canvas = _el('atlas-agents-lines');
  const network = _el('atlas-agents-network');
  const hub = _el('atlas-agents-core-hub');
  if (!canvas || !network || !hub) return;

  const rect = network.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  canvas.style.width = rect.width + 'px';
  canvas.style.height = rect.height + 'px';

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);

  const hubRect = hub.getBoundingClientRect();
  const hx = hubRect.left + hubRect.width / 2 - rect.left;
  const hy = hubRect.top + hubRect.height / 2 - rect.top;
  const t = performance.now() * 0.001;

  document.querySelectorAll('.atlas-agent-pod').forEach((pod, i) => {
    const pr = pod.getBoundingClientRect();
    const px = pr.left + pr.width / 2 - rect.left;
    const py = pr.top + pr.height / 2 - rect.top;
    const pulse = 0.35 + Math.sin(t * 2 + i) * 0.2;
    const working = pod.classList.contains('atlas-agent-pod--working');

    ctx.strokeStyle = `rgba(80, 200, 255, ${(working ? 0.35 : 0.15) + pulse * 0.25})`;
    ctx.lineWidth = working ? 1.5 : 1;
    ctx.setLineDash([6, 10]);
    ctx.lineDashOffset = -t * 40;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(px, py);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(px, py, working ? 4 : 3, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(120, 230, 255, ${(working ? 0.6 : 0.4) + pulse * 0.3})`;
    ctx.fill();
  });

  ctx.beginPath();
  ctx.arc(hx, hy, 8, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(100, 220, 255, 0.35)';
  ctx.fill();

  _linesRaf = requestAnimationFrame(_drawConnectionLines);
}

function _bindEvents() {
  const controls = _el('atlas-agents-controls');
  if (controls) {
    controls.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-agent-id][data-action]');
      if (!btn || btn.disabled) return;
      await _runAction(btn.dataset.agentId, btn.dataset.action);
    });
  }

  const reportsPanel = _el('atlas-agents-office');
  if (reportsPanel) {
    reportsPanel.addEventListener('click', (e) => {
      const item = e.target.closest('[data-report-id]');
      if (!item) return;
      _openReport(item.dataset.reportId);
    });
    reportsPanel.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const item = e.target.closest('[data-report-id]');
      if (!item) return;
      e.preventDefault();
      _openReport(item.dataset.reportId);
    });
  }

  const modal = _el('atlas-report-modal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target.closest('[data-atlas-report-close]')) _closeReportModal();
      const actionBtn = e.target.closest('[data-report-action]');
      if (actionBtn) _reportAction(actionBtn.dataset.reportAction);
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && _activeReportId) _closeReportModal();
  });

  window.addEventListener('resize', () => {
    if (_linesRunning) _drawConnectionLines();
  });
}

export function initAgentsOffice(deps = {}) {
  _deps = deps;
  _bindEvents();
}

const agentsOfficeModule = {
  initAgentsOffice,
  renderAgentsOffice,
  refreshAgentsOffice,
  startAgentLines,
  stopAgentLines,
};

export default agentsOfficeModule;
