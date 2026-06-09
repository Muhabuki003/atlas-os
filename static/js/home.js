// ============================================
// Atlas OS — Mission Control Shell
// ============================================

import { startAtlasCore, stopAtlasCore, startAtlasBackdrop } from './atlasCore.js';
import {
  updateBriefingTicker,
  isAtlasHomeRoute,
  isAtlasAgentsRoute,
  isAtlasProjectsRoute,
  isAtlasFinanceRoute,
  atlasHomeUrl,
  atlasAgentsUrl,
  atlasProjectsUrl,
  atlasFinanceUrl,
} from './atlasShell.js';
import agentsOfficeModule from './agentsOffice.js';
import atlasProjectsModule from './atlasProjects.js';
import atlasFinanceModule from './atlasFinance.js';
import atlasPipelineModule from './atlasPipeline.js';
import atlasProjectContext from './atlasProjectContext.js';
import atlasProjectHQ from './atlasProjectHQ.js';
import atlasActiveProject from './atlasActiveProject.js';
import atlasDesktopApps from './atlasDesktopApps.js';
import atlasReasoningAudit from './atlasReasoningAudit.js';
import atlasGoals from './atlasGoals.js';

export {
  isAtlasHomeRoute,
  isAtlasAgentsRoute,
  isAtlasProjectsRoute,
  isAtlasFinanceRoute,
} from './atlasShell.js';

let _deps = {};
let _projects = [];
let _agents = [];
let _briefing = null;
let _briefingV2 = null;
let _profile = null;
let _active = false;
let _dataReady = false;
let _prefetchPromise = null;

function _el(id) {
  return document.getElementById(id);
}

function _statusLabel(status) {
  const map = { idle: 'Idle', ready: 'Ready', thinking: 'Thinking', waiting: 'Waiting' };
  return map[status] || status;
}

function _esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function _fetchJson(url) {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.json();
}

export async function loadProjects() {
  try {
    const data = await _fetchJson('/api/atlas/projects/recent');
    _projects = Array.isArray(data.projects) ? data.projects : [];
  } catch (_) {
    try {
      const fallback = await _fetchJson('/api/atlas/projects');
      _projects = Array.isArray(fallback.projects) ? fallback.projects : [];
    } catch (_) {
      _projects = [];
    }
  }
  return _projects;
}

function _formatActivity(p) {
  const ts = p.last_activity_at || p.last_indexed_at || p.last_seen_at;
  if (!ts) return 'No activity';
  try {
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch (_) {
    return ts.slice(0, 10);
  }
}

function _changeCount(p) {
  const ch = p.recent_changes || {};
  return (ch.new_count || 0) + (ch.modified_count || 0) + (ch.deleted_count || 0);
}

async function _loadAgents() {
  try {
    const data = await _fetchJson('/api/atlas/agents');
    _agents = Array.isArray(data.agents) ? data.agents : [];
  } catch (_) {
    _agents = [];
  }
  return _agents;
}

async function _loadProfile() {
  try {
    _profile = await _fetchJson('/api/atlas/profile');
  } catch (_) {
    _profile = null;
  }
  return _profile;
}

async function _loadBriefing() {
  try {
    _briefingV2 = await _fetchJson('/api/atlas/briefing/v2');
    _briefing = _briefingV2;
  } catch (_) {
    try {
      _briefing = await _fetchJson('/api/atlas/briefing');
    } catch (_) {
      _briefing = null;
    }
    _briefingV2 = null;
  }
  return _briefingV2 || _briefing;
}

async function _refreshAtlasData() {
  await Promise.all([
    loadProjects(),
    _loadAgents(),
    _loadProfile(),
    _loadBriefing(),
  ]);
  _dataReady = true;
}

function _renderAll() {
  _renderBriefing();
  _renderProjects();
  _renderAgents();
  void atlasGoals.renderHomeGoals();
}

function _renderBriefing() {
  const el = _el('atlas-home-briefing-text');
  const v2 = _briefingV2;
  const spoken = v2?.spoken || (_briefing && _briefing.text);
  if (el) {
    el.textContent = spoken
      || 'Atlas is ready. Scan your workspace and refresh the briefing.';
  }
  updateBriefingTicker();

  const headline = _el('atlas-briefing-headline');
  const priorities = _el('atlas-briefing-priorities');
  const rec = _el('atlas-briefing-recommendation');
  const visual = v2?.visual || {};
  if (headline) headline.textContent = visual.headline || spoken || 'Briefing unavailable';
  if (priorities) {
    const items = visual.priorities || [];
    priorities.innerHTML = items.length
      ? items.slice(0, 4).map(p => `
        <li>
          <button type="button" class="atlas-briefing-project-btn" data-briefing-project="${_esc(p.project_id || '')}" title="Open Project HQ">
            <strong>${_esc(p.name || 'Project')}</strong>
          </button>
          <span class="atlas-briefing-score">${p.potential_score ?? p.score ?? '—'}</span>
          ${p.stage ? `<span class="atlas-briefing-stage">${_esc(p.stage)}</span>` : ''}
        </li>`).join('')
      : '<li class="atlas-mc-empty">No indexed projects yet.</li>';
  }
  if (rec) rec.textContent = visual.recommendation || '';
}

async function _speakBriefing() {
  const text = _briefingV2?.spoken || (_briefing && _briefing.text);
  if (!text) return;
  if (window.atlasVoiceMode?.speakText) {
    await window.atlasVoiceMode.speakText(text, { short: false });
    return;
  }
  if (window.speechSynthesis) {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-GB';
    window.speechSynthesis.speak(u);
  }
}

function _openBriefingDetails() {
  const v2 = _briefingV2;
  if (!v2?.visual) {
    _deps.showToast?.('Refresh briefing first');
    return;
  }
  const v = v2.visual;
  const lines = [
    v.greeting,
    v.headline,
    v.recommendation,
    ...(v.project_changes || []).map(c => `Changes: ${c.name} (+${c.new_count || 0} new, ~${c.modified_count || 0} modified)`),
    ...(v.finance || []).map(f => f.type === 'bill' ? `Bill: ${f.name} in ${f.days_until}d` : `Pay est.: £${f.weekly_net}`),
    ...(v.agent_reports || []).map(r => `Pending: ${r.agent || r.title}`),
  ].filter(Boolean);
  window.alert(lines.join('\n\n'));
}

function _renderProjects() {
  const list = _el('atlas-home-projects');
  if (!list) return;
  if (!_projects.length) {
    list.innerHTML = '<p class="atlas-mc-empty">Scan projects in Projects to populate Recent Projects.</p>';
    return;
  }
  list.innerHTML = _projects.map(p => {
    const stack = (p.detected_stack || []).slice(0, 2).join(' · ') || p.detected_type || p.type || '';
    const changes = _changeCount(p);
    return `
    <button type="button" class="atlas-home-recent-card" data-project-id="${_esc(p.id)}">
      <span class="atlas-home-recent-pin${p.pinned ? ' atlas-home-recent-pin--on' : ''}" data-pin-project="${_esc(p.id)}" title="Pin project" aria-label="Pin">★</span>
      <span class="atlas-home-recent-name">${_esc(p.name)}</span>
      <span class="atlas-home-recent-stack">${_esc(stack)}</span>
      <span class="atlas-home-recent-meta">${_formatActivity(p)}${changes ? ` · ${changes} changes` : ''}</span>
    </button>
  `;
  }).join('');
}

function _renderAgents() {
  const list = _el('atlas-home-agents');
  if (!list) return;
  if (!_agents.length) {
    list.innerHTML = '<p class="atlas-mc-empty">No agents configured yet.</p>';
    return;
  }
  list.innerHTML = _agents.map(a => `
    <div class="atlas-home-agent atlas-home-agent--compact" data-agent-id="${_esc(a.id)}">
      <span class="atlas-home-agent-name">${_esc(a.name)}</span>
      <span class="atlas-home-agent-status atlas-home-agent-status--${_esc(a.status)}">${_statusLabel(a.status)}</span>
    </div>
  `).join('');
}

function _setNavActive(view) {
  const homeBtn = _el('sidebar-home-btn');
  const asstBtn = _el('sidebar-assistant-btn');
  if (homeBtn) homeBtn.classList.toggle('active', view === 'home');
  if (asstBtn) asstBtn.classList.toggle('active', view === 'assistant');
}

function _setDockActive(id) {
  document.querySelectorAll('.atlas-mc-dock-item').forEach(btn => {
    btn.classList.toggle('active', id != null && btn.dataset.dockId === id);
  });
}

const _SHELL_PANEL_IDS = [
  'atlas-home',
  'atlas-agents-office',
  'atlas-projects-panel',
  'atlas-finance-panel',
];

function _hideShellPanels() {
  _SHELL_PANEL_IDS.forEach(id => {
    const el = _el(id);
    if (el) el.classList.add('hidden');
  });
  agentsOfficeModule.stopAgentLines();
}

function _setAtlasView(view) {
  document.body.classList.remove(
    'atlas-view-home',
    'atlas-view-assistant',
    'atlas-view-agents',
    'atlas-view-projects',
    'atlas-view-finance',
    'atlas-view-tool',
  );
  document.body.classList.add(`atlas-view-${view}`);
  document.body.classList.toggle('atlas-home-active', view === 'home');
}

function _showShellPanel(id) {
  const panel = _el(id);
  if (panel) panel.classList.remove('hidden');
}

function _scheduleCoreStart() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => startAtlasCore());
  });
}

/** Prefetch Atlas API data — safe to call multiple times. */
export function prefetchAtlasData() {
  if (!_prefetchPromise) {
    _prefetchPromise = _refreshAtlasData()
      .then(() => {
        if (_active || document.body.classList.contains('atlas-view-home')) {
          _renderAll();
          void _maybeAutoSpeakBriefing();
          void _refreshDesktopControl();
        }
        if (document.body.classList.contains('atlas-view-agents')) {
          agentsOfficeModule.renderAgentsOffice(_agents);
        }
      })
      .catch(() => {
        _prefetchPromise = null;
      });
  }
  return _prefetchPromise;
}

/** Boot Atlas shell immediately on app init (before loadSessions). */
export function bootAtlasHome() {
  startAtlasBackdrop();

  const onHome = isAtlasHomeRoute()
    || document.body.classList.contains('atlas-view-home')
    || document.body.classList.contains('atlas-home-active');

  prefetchAtlasData();

  if (isAtlasFinanceRoute()) {
    showFinance({ skipHistory: true });
  } else if (isAtlasProjectsRoute()) {
    showProjects({ skipHistory: true });
  } else if (isAtlasAgentsRoute()) {
    showAgentsOffice({ skipHistory: true });
  } else if (onHome) {
    _active = true;
    _setAtlasView('home');
    _setDockActive('home');
    _setNavActive('home');
    const home = _el('atlas-home');
    if (home) home.classList.remove('hidden');
    _scheduleCoreStart();
    window.atlasHomeConversation?.onHomeShown?.();
  }
}

export function isHomeActive() {
  return _active;
}

function _syncHomeHistory({ skipHistory = false, replace = false } = {}) {
  if (skipHistory) return;
  const url = atlasHomeUrl();
  const state = { atlasView: 'home' };
  if (window.location.pathname === url && !window.location.hash) return;
  if (replace) {
    history.replaceState(state, '', url);
  } else {
    history.pushState(state, '', url);
  }
}

export async function showHome({ skipHistory = false, replace = false } = {}) {
  _active = true;
  window.atlasVoiceService?.onRouteChange?.('home');
  document.title = 'Atlas OS';
  _syncHomeHistory({ skipHistory, replace });
  _setAtlasView('home');
  _hideShellPanels();
  const home = _el('atlas-home');
  if (home) home.classList.remove('hidden');
  _setNavActive('home');
  _setDockActive('home');
  _scheduleCoreStart();

  if (_dataReady) _renderAll();
  await prefetchAtlasData();
  _renderAll();
  void atlasGoals.renderHomeGoals();
  void _maybeAutoSpeakBriefing();
  void _refreshDesktopControl();
}

let _briefingAutoSpoken = false;

async function _maybeAutoSpeakBriefing() {
  if (_briefingAutoSpoken) return;
  try {
    const data = await _fetchJson('/api/atlas/briefing/settings');
    const settings = data.settings || {};
    if (!settings.speak_on_home_start) return;
    _briefingAutoSpoken = true;
    await _speakBriefing();
  } catch (_) {}
}

async function _refreshDesktopControl() {
  try {
    const data = await _fetchJson('/api/atlas/desktop/status');
    const statusEl = _el('atlas-desktop-control-status');
    const metaEl = _el('atlas-desktop-control-meta');
    const cursorBtn = _el('atlas-desktop-open-cursor');
    const folderBtn = _el('atlas-desktop-open-folder');
    const testCursorBtn = _el('atlas-desktop-test-cursor');
    const testBrowserBtn = _el('atlas-desktop-test-browser');
    const ready = data.state === 'ready' || (data.enabled && data.bridge_ready);
    if (statusEl) statusEl.textContent = data.label || 'Desktop Control: Disabled';
    if (metaEl) {
      const avail = (data.available_apps || []).length;
      const total = data.app_count;
      metaEl.textContent = ready && total != null
        ? `${avail}/${total} apps available on bridge`
        : (data.message || '');
    }
    if (cursorBtn) cursorBtn.disabled = !ready;
    if (folderBtn) folderBtn.disabled = !ready;
    if (testCursorBtn) testCursorBtn.disabled = !ready;
    if (testBrowserBtn) testBrowserBtn.disabled = !ready;
    window._atlasDesktopHint = data.setup_hint || '';
  } catch (_) {}
}

async function _desktopCommand(command, args = {}) {
  const res = await fetch('/api/atlas/desktop/command', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command, args }),
  });
  const data = await res.json();
  _deps.showToast?.(data.message || (data.ok ? 'Command sent' : 'Desktop command failed'));
  return data;
}

function _openDesktopSetup() {
  const hint = window._atlasDesktopHint || (
    'Atlas runs inside Docker and cannot open Windows apps directly.\n\n'
    + 'A small Windows host bridge will receive approved commands (Cursor, Explorer, browsers) '
    + 'after you enable desktop_commands_enabled and set bridge_url in data/atlas/desktop_permissions.json.'
  );
  window.alert(hint);
}

function _syncAgentsHistory({ skipHistory = false } = {}) {
  if (skipHistory) return;
  const url = atlasAgentsUrl();
  if (window.location.pathname === url) return;
  history.pushState({ atlasView: 'agents' }, '', url);
}

export async function showAgentsOffice({ skipHistory = false } = {}) {
  _active = false;
  window.atlasVoiceService?.onRouteChange?.('agents');
  document.title = 'Agents Office — Atlas OS';
  _syncAgentsHistory({ skipHistory });
  _setAtlasView('agents');
  _hideShellPanels();
  stopAtlasCore();
  const office = _el('atlas-agents-office');
  if (office) office.classList.remove('hidden');
  _setNavActive('home');
  _setDockActive('agents');

  await prefetchAtlasData();
  agentsOfficeModule.renderAgentsOffice(_agents);
  await agentsOfficeModule.refreshAgentsOffice();
  agentsOfficeModule.startAgentLines();
  await atlasPipelineModule.renderPipeline();
}

function _syncProjectsHistory({ skipHistory = false } = {}) {
  if (skipHistory) return;
  const url = atlasProjectsUrl();
  if (window.location.pathname === url) return;
  history.pushState({ atlasView: 'projects' }, '', url);
}

export async function showProjects({ skipHistory = false } = {}) {
  _active = false;
  window.atlasVoiceService?.onRouteChange?.('projects');
  document.title = 'Projects — Atlas OS';
  _syncProjectsHistory({ skipHistory });
  _setAtlasView('projects');
  _hideShellPanels();
  stopAtlasCore();
  _showShellPanel('atlas-projects-panel');
  _setNavActive('home');
  _setDockActive('projects');
  await prefetchAtlasData();
  await atlasProjectsModule.renderProjectsPanel();
}

function _syncFinanceHistory({ skipHistory = false } = {}) {
  if (skipHistory) return;
  const url = atlasFinanceUrl();
  if (window.location.pathname === url) return;
  history.pushState({ atlasView: 'finance' }, '', url);
}

export async function showFinance({ skipHistory = false } = {}) {
  _active = false;
  window.atlasVoiceService?.onRouteChange?.('finance');
  document.title = 'Finance — Atlas OS';
  _syncFinanceHistory({ skipHistory });
  _setAtlasView('finance');
  _hideShellPanels();
  stopAtlasCore();
  _showShellPanel('atlas-finance-panel');
  _setNavActive('home');
  _setDockActive('finance');
  await atlasFinanceModule.renderFinancePanel();
}

export function showAssistantView({ dockId = 'assistant' } = {}) {
  _active = false;
  window.atlasVoiceService?.onRouteChange?.('assistant');
  stopAtlasCore();
  agentsOfficeModule.stopAgentLines();
  if (document.title === 'Atlas OS' || document.title.startsWith('Agents Office')) document.title = 'Atlas';
  _setAtlasView('assistant');
  _hideShellPanels();
  _setNavActive('assistant');
  _setDockActive(dockId);
  window.sessionModule?.renderSessionList?.();
}

export function getAtlasAgents() {
  return _agents;
}

export function hideHome() {
  showAssistantView();
}

function _openAssistant(prompt, opts) {
  if (_deps.openAssistant) _deps.openAssistant(prompt, opts);
}

function _openTool(id) {
  if (_deps.openTool) _deps.openTool(id);
}

function _bindEvents() {
  const cmdInput = _el('atlas-home-command-input');
  const cmdForm = _el('atlas-home-command-form');

  if (cmdForm) {
    cmdForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = (cmdInput?.value || '').trim();
      if (!text) return;
      if (cmdInput) cmdInput.value = '';
      if (window.atlasHomeConversation?.submitHomeMessage) {
        await window.atlasHomeConversation.submitHomeMessage(text);
      } else {
        _openAssistant(text, { submit: true, stayOnHome: true });
      }
    });
  }

  const briefingPriorities = _el('atlas-briefing-priorities');
  if (briefingPriorities) {
    briefingPriorities.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-briefing-project]');
      if (!btn?.dataset.briefingProject) return;
      atlasProjectHQ.openProjectHQ(btn.dataset.briefingProject);
    });
  }

  const projects = _el('atlas-home-projects');
  if (projects) {
    projects.addEventListener('click', async (e) => {
      const pin = e.target.closest('[data-pin-project]');
      if (pin) {
        e.stopPropagation();
        const id = pin.dataset.pinProject;
        const res = await fetch(`/api/atlas/projects/${id}/pin`, { method: 'POST', credentials: 'same-origin' });
        const data = await res.json();
        if (data.ok) {
          await loadProjects();
          _renderProjects();
        }
        return;
      }
      const card = e.target.closest('[data-project-id]');
      if (!card) return;
      atlasProjectHQ.openProjectHQ(card.dataset.projectId);
    });
  }

  const dock = _el('atlas-mc-dock');
  if (dock) {
    dock.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-dock-id]');
      if (!btn) return;
      _openTool(btn.dataset.dockId);
    });
  }

  _el('atlas-briefing-speak')?.addEventListener('click', () => { void _speakBriefing(); });
  _el('atlas-briefing-refresh')?.addEventListener('click', async () => {
    await _loadBriefing();
    _renderBriefing();
    _deps.showToast?.('Briefing refreshed');
  });
  _el('atlas-briefing-details')?.addEventListener('click', () => _openBriefingDetails());
  _el('atlas-desktop-open-cursor')?.addEventListener('click', () => {
    void _desktopCommand('open_app', { app: 'cursor' });
  });
  _el('atlas-desktop-open-folder')?.addEventListener('click', () => {
    const active = atlasActiveProject.getActiveProjectId?.();
    void _desktopCommand('open_project_in_cursor', { project_id: active || '' });
  });
  _el('atlas-desktop-setup')?.addEventListener('click', () => _openDesktopSetup());

  window.addEventListener('resize', () => {
    if (_active) updateBriefingTicker();
  });
}

export function initHome(deps = {}) {
  _deps = deps;
  agentsOfficeModule.initAgentsOffice({
    showToast: deps.showToast,
    openAssistant: deps.openAssistant,
    showProjects: () => showProjects({ skipHistory: false }),
  });
  atlasProjectsModule.initAtlasProjects({ showToast: deps.showToast });
  atlasFinanceModule.initAtlasFinance({ showToast: deps.showToast });
  atlasPipelineModule.initAtlasPipeline({
    showToast: deps.showToast,
    onPipelineUpdate: () => agentsOfficeModule.refreshAgentsOffice(),
  });
  atlasProjectContext.initAtlasProjectContext({
    showToast: deps.showToast,
    openSummary: (id) => atlasProjectsModule.openProjectSummary?.(id),
    onPinChange: async () => { await loadProjects(); _renderProjects(); },
  });
  atlasProjectHQ.initAtlasProjectHQ({ showToast: deps.showToast });
  atlasDesktopApps.initAtlasDesktopApps({ showToast: deps.showToast });
  atlasReasoningAudit.initAtlasReasoningAudit({ showToast: deps.showToast });
  atlasActiveProject.initAtlasActiveProject({
    navigateAssistant: () => deps.openAssistant?.('', { submit: false }),
  });
  window.atlasPipelineRefresh = () => atlasPipelineModule.renderPipeline();
  _bindEvents();
  bootAtlasHome();
  if (deps.defaultHome && !deps.skipDefaultHome
    && !isAtlasAgentsRoute() && !isAtlasProjectsRoute() && !isAtlasFinanceRoute()) {
    showHome();
  }
}

const homeModule = {
  initHome,
  bootAtlasHome,
  prefetchAtlasData,
  showHome,
  showAgentsOffice,
  showProjects,
  showFinance,
  showAssistantView,
  hideHome,
  isHomeActive,
  loadProjects,
  getAtlasAgents,
};

export default homeModule;
