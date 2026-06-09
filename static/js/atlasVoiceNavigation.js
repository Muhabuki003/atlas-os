// Atlas OS — voice navigation + project/council voice actions (client-side)

import atlasActiveProject from './atlasActiveProject.js';
import { cmdHandled, cmdUnhandled } from './atlasCommandResult.js';

let _deps = {};
let _councilStatus = 'IDLE';

const NAV_TARGETS = {
  home: { label: 'Home', paths: ['/home', '/'], navigate: () => _goHome() },
  assistant: { label: 'Assistant', paths: ['/assistant'], navigate: () => _goAssistant() },
  projects: { label: 'Projects', paths: ['/projects'], navigate: () => _goProjects() },
  agents: { label: 'Agents', paths: ['/agents'], navigate: () => _goAgents() },
  finance: { label: 'Finance', paths: ['/finance'], navigate: () => _goFinance() },
  brain: { label: 'Brain', paths: ['/memory'], navigate: () => _openTool('memory') },
  tasks: { label: 'Tasks', paths: ['/tasks'], navigate: () => _openTool('tasks') },
  calendar: { label: 'Calendar', paths: ['/calendar'], navigate: () => _openCalendar() },
  notes: { label: 'Notes', paths: ['/notes'], navigate: () => _openNotes() },
  library: { label: 'Library', paths: ['/library'], navigate: () => _openLibrary() },
  cookbook: { label: 'Cookbook', paths: ['/cookbook'], navigate: () => _openCookbook() },
  settings: { label: 'Settings', paths: [], navigate: () => _openSettings() },
};

const NAV_PREFIX = /^(?:(?:hey\s+)?atlas\s+)?(?:(?:can\s+you|could\s+you|please)\s+)?(?:move\s+to|navigate\s+to|switch\s+to|go\s+to|open)\s+/i;

const DESTRUCTIVE = [
  /\bdelete\b/i,
  /\bshutdown\b/i,
  /\brestart\s+(?:the\s+)?(?:pc|computer)\b/i,
  /\bformat\b/i,
  /\bremove\s+project\b/i,
];

function _norm(text) {
  return String(text || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function _goHome() {
  window.homeModule?.showHome?.({ skipHistory: false });
  history.pushState({ atlasView: 'home' }, '', '/home');
}

function _goAssistant() {
  window.homeModule?.showAssistantView?.({ dockId: 'assistant' });
  history.pushState({}, '', '/assistant');
}

function _goProjects() {
  window.homeModule?.showProjects?.({ skipHistory: false });
}

function _goAgents() {
  window.homeModule?.showAgentsOffice?.({ skipHistory: false });
}

function _goFinance() {
  window.homeModule?.showFinance?.({ skipHistory: false });
}

function _openTool(id) {
  _deps.openTool?.(id);
}

function _openCalendar() {
  document.getElementById('tool-calendar-btn')?.click()
    || (window.location.pathname !== '/calendar' && history.pushState({}, '', '/calendar'));
}

function _openNotes() {
  if (window.location.pathname !== '/notes') history.pushState({}, '', '/notes');
  window._odysseusRouteOpener?.();
  import('./notes.js').then((m) => m.default?.openPanel?.()).catch(() => {});
}

function _openLibrary() {
  window.sessionModule?.openLibrary?.();
}

function _openCookbook() {
  document.getElementById('tool-cookbook-btn')?.click();
}

function _openSettings() {
  document.getElementById('settings-btn')?.click()
    || document.querySelector('[data-open-settings]')?.click();
}

async function _fetchJson(url, opts = {}) {
  const res = await fetch(url, { credentials: 'same-origin', ...opts });
  return res.json();
}

async function _resolveProject(query, projects) {
  const q = _norm(query);
  if (!q) return null;
  for (const p of projects) {
    const id = (p.id || '').toLowerCase();
    const name = (p.name || '').toLowerCase();
    if (q === id || q === name || name.includes(q) || q.includes(name)) return p;
  }
  return null;
}

export function setCouncilStatus(status) {
  _councilStatus = status || 'IDLE';
}

export function getCouncilStatus() {
  return _councilStatus;
}

export function isDestructiveCommand(text) {
  const t = String(text || '');
  return DESTRUCTIVE.some((re) => re.test(t));
}

export async function tryHandleNavigation(text) {
  const raw = String(text || '').trim();
  let norm = _norm(raw);
  if (!norm) return cmdUnhandled();

  const m = norm.match(NAV_PREFIX);
  if (m) norm = norm.slice(m[0].length).trim();

  for (const [key, cfg] of Object.entries(NAV_TARGETS)) {
    if (norm === key || norm === cfg.label.toLowerCase()) {
      cfg.navigate();
      return cmdHandled(true, `Opening ${cfg.label}.`);
    }
  }
  return cmdUnhandled();
}

export async function tryHandleAtlasCommands(text) {
  const norm = _norm(text);
  if (!norm) return cmdUnhandled();

  if (norm === 'stop speaking') {
    window.speechSynthesis?.cancel();
    return cmdHandled(true, 'Stopped speaking.');
  }
  if (norm === 'repeat') {
    return cmdHandled(true, 'Repeat is not available for the last reply yet.');
  }
  if (norm === 'continue') {
    return cmdHandled(true, 'Continuing.');
  }
  if (norm === 'refresh workspace') {
    await window.homeModule?.prefetchAtlasData?.();
    return cmdHandled(true, 'Workspace refreshed.');
  }

  return cmdUnhandled();
}

export async function tryHandleProjectCommands(text) {
  const norm = _norm(text);
  if (!norm) return cmdUnhandled();

  let projects = [];
  try {
    const data = await _fetchJson('/api/atlas/projects');
    projects = data.projects || data || [];
  } catch (_) {
    return cmdUnhandled();
  }

  const activeId = atlasActiveProject.getActiveProjectId?.();
  const active = projects.find((p) => p.id === activeId) || projects[0];

  const openHq = norm.match(/^(?:open\s+)?(?:project\s+)?hq(?:\s+for\s+(.+))?$/);
  if (openHq) {
    const proj = openHq[1] ? await _resolveProject(openHq[1], projects) : active;
    if (proj) {
      const mod = await import('./atlasProjectHQ.js');
      mod.default.openProjectHQ(proj.id);
      return cmdHandled(true, `Opening Project HQ for ${proj.name || proj.id}.`);
    }
  }

  const review = norm.match(/^review\s+(.+)$/);
  if (review) {
    const proj = await _resolveProject(review[1], projects);
    if (proj) {
      const mod = await import('./atlasProjectHQ.js');
      mod.default.openProjectHQ(proj.id);
      return cmdHandled(true, `Opening ${proj.name} for review.`);
    }
  }

  const council = norm.match(/^(?:run\s+)?council\s+review(?:\s+(?:for\s+)?(.+))?$/);
  if (council) {
    const proj = council[1] ? await _resolveProject(council[1], projects) : active;
    if (!proj) return cmdHandled(false, 'No project found for council review.');
    setCouncilStatus('RUNNING');
    const res = await _fetchJson(`/api/atlas/projects/${proj.id}/council-review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    setCouncilStatus(res.ok ? 'READY' : 'IDLE');
    return cmdHandled(!!res.ok, res.message || (res.ok ? 'Council review started.' : 'Council review failed.'));
  }

  const cursorPrompt = norm.match(/^generate\s+cursor\s+prompt(?:\s+(?:for\s+)?(.+))?$/);
  if (cursorPrompt) {
    const proj = cursorPrompt[1] ? await _resolveProject(cursorPrompt[1], projects) : active;
    if (!proj) return cmdHandled(false, 'No project found.');
    const res = await _fetchJson(`/api/atlas/projects/${proj.id}/generate-cursor-prompt`, { method: 'POST' });
    return cmdHandled(!!res.ok, res.message || (res.ok ? 'Cursor prompt generated.' : 'Failed to generate prompt.'));
  }

  const launchPlan = norm.match(/^generate\s+launch\s+plan(?:\s+(?:for\s+)?(.+))?$/);
  if (launchPlan) {
    const proj = launchPlan[1] ? await _resolveProject(launchPlan[1], projects) : active;
    if (!proj) return cmdHandled(false, 'No project found.');
    const res = await _fetchJson(`/api/atlas/projects/${proj.id}/create-launch-plan`, { method: 'POST' });
    return cmdHandled(!!res.ok, res.message || (res.ok ? 'Launch plan created.' : 'Failed to create launch plan.'));
  }

  const deepIndex = norm.match(/^deep\s+index(?:\s+project)?(?:\s+(?:for\s+)?(.+))?$/);
  if (deepIndex) {
    const proj = deepIndex[1] ? await _resolveProject(deepIndex[1], projects) : active;
    if (!proj) return cmdHandled(false, 'No project found.');
    const res = await _fetchJson(`/api/atlas/projects/${proj.id}/deep-index`, { method: 'POST' });
    return cmdHandled(!!res.ok, res.message || (res.ok ? 'Deep index started.' : 'Deep index failed.'));
  }

  if (norm === 'open active project' || norm === 'open latest project') {
    const proj = active;
    if (!proj) return cmdHandled(false, 'No active project set.');
    const mod = await import('./atlasProjectHQ.js');
    mod.default.openProjectHQ(proj.id);
    return cmdHandled(true, `Opening ${proj.name || proj.id}.`);
  }

  return cmdUnhandled();
}

export function initAtlasVoiceNavigation(deps = {}) {
  _deps = deps;
}

const atlasVoiceNavigation = {
  tryHandleNavigation,
  tryHandleAtlasCommands,
  tryHandleProjectCommands,
  isDestructiveCommand,
  setCouncilStatus,
  getCouncilStatus,
  initAtlasVoiceNavigation,
};

export default atlasVoiceNavigation;
