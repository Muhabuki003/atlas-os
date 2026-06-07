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
import atlasVoiceMode from './atlasVoiceMode.js';
import atlasPipelineModule from './atlasPipeline.js';
import atlasProjectContext from './atlasProjectContext.js';
import atlasActiveProject from './atlasActiveProject.js';

export {
  isAtlasHomeRoute,
  isAtlasAgentsRoute,
  isAtlasProjectsRoute,
  isAtlasFinanceRoute,
} from './atlasShell.js';

const CHIP_ACTIONS = [
  { id: 'houseify', label: 'Continue Houseify', match: /houseify/i },
  { id: 'transport', label: 'Review TransportOS', match: /transport/i },
  {
    id: 'cursor',
    label: 'Create Cursor Prompt',
    prompt: 'Help me write a precise Cursor agent prompt for a coding task. Ask what I\'m building, then output a copy-paste prompt.',
  },
  { id: 'briefing', label: 'Start Daily Briefing', action: 'briefing' },
  { id: 'assistant', label: 'Open Assistant', action: 'assistant' },
];

let _deps = {};
let _projects = [];
let _agents = [];
let _briefing = null;
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
    _briefing = await _fetchJson('/api/atlas/briefing');
  } catch (_) {
    _briefing = null;
  }
  return _briefing;
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
  _renderGreeting();
  _renderBriefing();
  _renderProjects();
  _renderAgents();
}

function _renderGreeting() {
  const greet = _el('atlas-home-greeting');
  if (!greet) return;
  const text = (_briefing && _briefing.greeting) || 'Good evening Aurelius. What shall we build today?';
  greet.textContent = text;
}

function _renderBriefing() {
  const el = _el('atlas-home-briefing-text');
  if (!el) return;
  el.textContent = (_briefing && _briefing.text)
    || 'Atlas is ready. Connect your projects and model provider to begin live project briefings.';
  updateBriefingTicker();
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
    <div class="atlas-home-agent" data-agent-id="${_esc(a.id)}" title="${_esc(a.role || '')}">
      <div class="atlas-home-agent-info">
        <span class="atlas-home-agent-name">${_esc(a.name)}</span>
        <span class="atlas-home-agent-role">${_esc(a.role || '')}</span>
      </div>
      <span class="atlas-home-agent-status atlas-home-agent-status--${_esc(a.status)}">${_statusLabel(a.status)}</span>
    </div>
  `).join('');
}

function _renderChips() {
  const list = _el('atlas-mc-chips');
  if (!list) return;
  list.innerHTML = CHIP_ACTIONS.map(a => `
    <button type="button" class="atlas-mc-chip" data-chip-id="${_esc(a.id)}">${_esc(a.label)}</button>
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

function _findProjectByChip(spec) {
  if (!spec.match) return null;
  return _projects.find(p => spec.match.test(p.id || '') || spec.match.test(p.name || ''));
}

/** Prefetch Atlas API data — safe to call multiple times. */
export function prefetchAtlasData() {
  if (!_prefetchPromise) {
    _prefetchPromise = _refreshAtlasData()
      .then(() => {
        if (_active || document.body.classList.contains('atlas-view-home')) {
          _renderAll();
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
  _renderChips();

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
  document.title = 'Atlas OS';
  _syncHomeHistory({ skipHistory, replace });
  _setAtlasView('home');
  _hideShellPanels();
  const home = _el('atlas-home');
  if (home) home.classList.remove('hidden');
  _setNavActive('home');
  _setDockActive('home');
  _renderChips();
  _scheduleCoreStart();

  if (_dataReady) _renderAll();
  await prefetchAtlasData();
  _renderAll();
}

function _syncAgentsHistory({ skipHistory = false } = {}) {
  if (skipHistory) return;
  const url = atlasAgentsUrl();
  if (window.location.pathname === url) return;
  history.pushState({ atlasView: 'agents' }, '', url);
}

export async function showAgentsOffice({ skipHistory = false } = {}) {
  _active = false;
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
  stopAtlasCore();
  agentsOfficeModule.stopAgentLines();
  if (document.title === 'Atlas OS' || document.title.startsWith('Agents Office')) document.title = 'Atlas';
  _setAtlasView('assistant');
  _hideShellPanels();
  _setNavActive('assistant');
  _setDockActive(dockId);
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

function _handleChip(chipId) {
  const spec = CHIP_ACTIONS.find(a => a.id === chipId);
  if (!spec) return;

  if (spec.action === 'briefing') {
    const bar = _el('atlas-home-briefing');
    if (bar) bar.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return;
  }
  if (spec.action === 'assistant') {
    _openAssistant('', { submit: false, fresh: true });
    return;
  }
  if (spec.prompt) {
    _openAssistant(spec.prompt, { submit: false });
    return;
  }
  const project = _findProjectByChip(spec);
  if (project) {
    const nxt = project.suggested_next_action ? ` ${project.suggested_next_action}` : '';
    _openAssistant(`Let's work on ${project.name}.${nxt}`, { submit: false });
    return;
  }
  if (_deps.showToast) _deps.showToast('Project not found in Atlas config');
}

function _bindEvents() {
  const cmdInput = _el('atlas-home-command-input');
  const cmdForm = _el('atlas-home-command-form');

  if (cmdForm) {
    cmdForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = (cmdInput?.value || '').trim();
      if (!text) return;
      if (cmdInput) cmdInput.value = '';
      _openAssistant(text, { submit: true });
    });
  }

  const voiceBtn = _el('atlas-mc-voice-btn');
  if (voiceBtn) {
    voiceBtn.addEventListener('click', (e) => {
      e.preventDefault();
      atlasVoiceMode.openVoiceMode();
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
      atlasProjectContext.openProjectContext(card.dataset.projectId);
    });
  }

  const chips = _el('atlas-mc-chips');
  if (chips) {
    chips.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-chip-id]');
      if (!btn) return;
      _handleChip(btn.dataset.chipId);
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

  window.addEventListener('resize', () => {
    if (_active) updateBriefingTicker();
  });
}

export function initHome(deps = {}) {
  _deps = deps;
  agentsOfficeModule.initAgentsOffice({ showToast: deps.showToast });
  atlasProjectsModule.initAtlasProjects({ showToast: deps.showToast });
  atlasFinanceModule.initAtlasFinance({ showToast: deps.showToast });
  atlasPipelineModule.initAtlasPipeline({
    showToast: deps.showToast,
    onPipelineUpdate: () => agentsOfficeModule.refreshAgentsOffice(),
  });
  atlasVoiceMode.initAtlasVoiceMode({
    showToast: deps.showToast,
    openAssistant: deps.openAssistant,
  });
  atlasProjectContext.initAtlasProjectContext({
    showToast: deps.showToast,
    openSummary: (id) => atlasProjectsModule.openProjectSummary?.(id),
    onPinChange: async () => { await loadProjects(); _renderProjects(); },
  });
  atlasActiveProject.initAtlasActiveProject({
    navigateAssistant: () => deps.openAssistant?.('', { submit: false }),
  });
  window.atlasVoiceMode = atlasVoiceMode;
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
