// Atlas OS V2 — contextual voice action engine

import AtlasVoiceContext from './atlasVoiceContext.js';
import atlasVoiceNavigation from './atlasVoiceNavigation.js';
import { cmdHandled, cmdUnhandled } from './atlasCommandResult.js';

const AGENT_ALIASES = {
  research: ['research', 'research agent', 'r&d', 'r and d'],
  business: ['business', 'business agent', 'biz', 'strategy'],
  architect: ['architect', 'architect agent', 'architecture', 'arc'],
  developer: ['developer', 'developer agent', 'dev', 'engineering'],
  marketing: ['marketing', 'marketing agent', 'mkt', 'launch'],
};

const STAGE_SEND = {
  business: 'business',
  architect: 'architect',
  developer: 'developer',
  marketing: 'marketing',
};

const REPORT_TYPES = {
  research_report: ['research report', 'research'],
  business_proposal: ['business proposal', 'business report', 'proposal'],
  architecture_plan: ['architecture plan', 'architecture report', 'architecture'],
  developer_cursor_prompt: ['developer cursor prompt', 'cursor prompt', 'developer report'],
  marketing_launch_plan: ['marketing launch plan', 'launch plan', 'marketing report'],
};

const AGENT_DEFAULT_REPORT = {
  research: 'research_report',
  business: 'business_proposal',
  architect: 'architecture_plan',
  developer: 'developer_cursor_prompt',
  marketing: 'marketing_launch_plan',
};

let _capture = null;
let _awaiting = null;

function _debug(tag, data) {
  try {
    if (localStorage.getItem('atlas_voice_debug') === 'true') {
      console.log(`[voice-action] ${tag}`, data);
    }
  } catch (_) {}
}

function _norm(text) {
  return String(text || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function _stripPrefixes(text) {
  return _norm(text)
    .replace(/^(?:(?:hey\s+)?atlas\s+)?(?:(?:can\s+you|could\s+you|please)\s+)?/i, '')
    .trim();
}

async function _fetchProjects() {
  try {
    const res = await fetch('/api/atlas/projects', { credentials: 'same-origin' });
    const data = await res.json();
    return data.projects || [];
  } catch (_) {
    return [];
  }
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

function _resolveAgent(query) {
  const q = _norm(query);
  if (!q) return null;
  for (const [id, aliases] of Object.entries(AGENT_ALIASES)) {
    if (aliases.some((a) => q === a || q.includes(a) || a.includes(q))) return id;
  }
  if (q.includes('this agent') || q === 'agent') {
    return AtlasVoiceContext.get().currentAgentId;
  }
  return null;
}

function _isClosePhrase(norm) {
  return /^(?:close(?:\s+(?:it|report|agent|project|hq|modal))?|exit|dismiss|back)$/.test(norm)
    || norm === 'close project hq'
    || norm === 'close agent'
    || norm === 'close report';
}

function _isFinishPhrase(norm) {
  return /^(?:finish message|message over|send message|send it|submit message)$/.test(norm);
}

function _isCancelPhrase(norm) {
  return /^(?:cancel message|forget message|never mind|cancel)$/.test(norm);
}

export function getMessageCaptureState() {
  return _capture ? { ..._capture } : null;
}

export function clearMessageCapture() {
  _capture = null;
  _awaiting = null;
}

export function parseVoiceAction(transcript, context = AtlasVoiceContext.get()) {
  const raw = String(transcript || '').trim();
  const norm = _stripPrefixes(raw);
  if (!norm) return { handled: false };

  const out = {
    handled: false,
    action: null,
    objectType: null,
    objectName: null,
    confidence: 0,
    payload: {},
  };

  if (_isFinishPhrase(norm)) {
    return { handled: true, action: 'finish_message', objectType: 'agent', confidence: 0.95, payload: {} };
  }
  if (_isCancelPhrase(norm) && (_capture || norm.includes('message'))) {
    return { handled: true, action: 'cancel_message', objectType: 'agent', confidence: 0.95, payload: {} };
  }

  if (_capture?.mode === 'message_body' && !_isClosePhrase(norm) && !_isFinishPhrase(norm)) {
    return {
      handled: true,
      action: 'message',
      objectType: 'agent',
      objectName: _capture.agentId,
      confidence: 0.9,
      payload: { message: raw.trim(), append: true },
    };
  }

  if (_awaiting === 'project_name') {
    return {
      handled: true,
      action: 'select',
      objectType: 'project',
      objectName: raw.trim(),
      confidence: 0.85,
      payload: { fromAwaiting: true },
    };
  }

  if (_isClosePhrase(norm)) {
    return { handled: true, action: 'close', objectType: 'modal', confidence: 0.9, payload: {} };
  }

  const scrollDown = /^(?:scroll down|next)$/.test(norm);
  const scrollUp = /^(?:scroll up|previous|prev)$/.test(norm);
  if (scrollDown) return { handled: true, action: 'scroll', objectType: 'modal', objectName: 'down', confidence: 0.9, payload: { direction: 'down' } };
  if (scrollUp) return { handled: true, action: 'scroll', objectType: 'modal', objectName: 'up', confidence: 0.9, payload: { direction: 'up' } };

  const navMatch = norm.match(/^(?:move to|navigate to|switch to|go to|open)\s+(.+)$/);
  if (navMatch) {
    return { handled: true, action: 'open', objectType: 'route', objectName: navMatch[1], confidence: 0.88, payload: {} };
  }

  if (/^open project hq$/.test(norm)) {
    return { handled: true, action: 'open', objectType: 'modal', objectName: 'project_hq', confidence: 0.9, payload: { projectId: context.currentProjectId } };
  }

  const selectOnly = norm.match(/^select(?:\s+project)?\s+(.+)$/);
  if (selectOnly && !selectOnly[1].includes('agent') && !selectOnly[1].includes('report')) {
    return { handled: true, action: 'select', objectType: 'project', objectName: selectOnly[1], confidence: 0.86, payload: {} };
  }

  const openProj = norm.match(/^open(?:\s+project)?\s+(.+)$/);
  if (openProj && !openProj[1].includes('agent') && !openProj[1].includes('report') && !['cursor', 'browser', 'chrome', 'spotify'].includes(openProj[1])) {
    return { handled: true, action: 'open', objectType: 'project', objectName: openProj[1], confidence: 0.86, payload: { openHq: true } };
  }

  const showProj = norm.match(/^show(?:\s+project)?\s+(.+)$/);
  if (showProj) {
    return { handled: true, action: 'select', objectType: 'project', objectName: showProj[1], confidence: 0.84, payload: {} };
  }

  const deepIndex = norm.match(/^deep index(?:\s+project)?(?:\s+(.+))?$/);
  if (deepIndex) {
    return { handled: true, action: 'deep_index', objectType: 'project', objectName: deepIndex[1] || context.currentProjectName, confidence: 0.88, payload: {} };
  }

  const cursorPrompt = norm.match(/^(?:generate|create|run)\s+cursor prompt(?:\s+(?:for\s+)?(.+))?$/);
  if (cursorPrompt) {
    return { handled: true, action: 'generate', objectType: 'project', objectName: cursorPrompt[1] || context.currentProjectName, confidence: 0.88, payload: { kind: 'cursor_prompt' } };
  }

  const launchPlan = norm.match(/^(?:generate|create)\s+launch plan(?:\s+(?:for\s+)?(.+))?$/);
  if (launchPlan) {
    return { handled: true, action: 'generate', objectType: 'project', objectName: launchPlan[1] || context.currentProjectName, confidence: 0.88, payload: { kind: 'launch_plan' } };
  }

  const council = norm.match(/^(?:run\s+)?council review(?:\s+(?:for\s+)?(.+))?$/);
  if (council) {
    return { handled: true, action: 'review', objectType: 'project', objectName: council[1] || context.currentProjectName, confidence: 0.86, payload: {} };
  }

  const reviewProj = norm.match(/^review\s+(.+)$/);
  if (reviewProj) {
    return { handled: true, action: 'open', objectType: 'project', objectName: reviewProj[1], confidence: 0.84, payload: { openHq: true } };
  }

  const selectAgent = norm.match(/^(?:select|open|show)\s+(.+)$/);
  if (selectAgent && (selectAgent[1].includes('agent') || Object.values(AGENT_ALIASES).flat().some((a) => selectAgent[1].includes(a.split(' ')[0])))) {
    return { handled: true, action: 'select', objectType: 'agent', objectName: selectAgent[1], confidence: 0.86, payload: {} };
  }

  const directMessage = norm.match(/^(?:message|send message to|talk to)\s+(.+?)\s+(.{8,})$/);
  if (directMessage) {
    const agentId = _resolveAgent(directMessage[1]);
    if (agentId) {
      return {
        handled: true,
        action: 'message',
        objectType: 'agent',
        objectName: agentId,
        confidence: 0.9,
        payload: { message: directMessage[2], direct: true },
      };
    }
  }

  if (/^(?:message agent|message this agent|send this agent a message|send message)$/.test(norm)) {
    return { handled: true, action: 'message', objectType: 'agent', objectName: context.currentAgentId, confidence: 0.9, payload: { startCapture: true } };
  }

  const messageAgent = norm.match(/^message\s+(.+?)\s+(.{8,})$/);
  if (messageAgent) {
    const agentId = _resolveAgent(messageAgent[1]);
    if (agentId) {
      return {
        handled: true,
        action: 'message',
        objectType: 'agent',
        objectName: agentId,
        confidence: 0.88,
        payload: { message: messageAgent[2], direct: true },
      };
    }
  }

  if (norm === 'open latest report') {
    return { handled: true, action: 'open', objectType: 'report', objectName: 'latest', confidence: 0.9, payload: {} };
  }

  const openReport = norm.match(/^open report\s+(.+)$/);
  if (openReport) {
    return { handled: true, action: 'open', objectType: 'report', objectName: openReport[1], confidence: 0.86, payload: {} };
  }

  if (/^(?:approve|approve report|accept report|accept)$/.test(norm)) {
    return { handled: true, action: 'approve', objectType: 'report', confidence: 0.9, payload: {} };
  }
  if (/^(?:request revision|revise report|reject|revise)$/.test(norm)) {
    return { handled: true, action: 'revise', objectType: 'report', confidence: 0.9, payload: {} };
  }
  if (/^archive(?:\s+report)?$/.test(norm)) {
    return { handled: true, action: 'archive', objectType: 'report', confidence: 0.9, payload: {} };
  }
  if (/^summar(?:y|ise)(?:\s+report)?$/.test(norm)) {
    return { handled: true, action: 'summarise', objectType: 'report', confidence: 0.88, payload: {} };
  }

  const sendStage = norm.match(/^send to\s+(.+?)(?:\s+agent)?$/);
  if (sendStage) {
    const stage = _resolveAgent(sendStage[1]);
    if (stage) {
      return { handled: true, action: 'send_next', objectType: 'report', objectName: stage, confidence: 0.86, payload: { stage } };
    }
  }
  if (norm === 'send to next agent') {
    return { handled: true, action: 'send_next', objectType: 'report', confidence: 0.9, payload: {} };
  }

  if (norm === 'select project') {
    return { handled: true, action: 'select', objectType: 'project', confidence: 0.85, payload: { prompt: true } };
  }
  const selectProjVoice = norm.match(/^select project\s+(.+)$/);
  if (selectProjVoice) {
    return { handled: true, action: 'select', objectType: 'project', objectName: selectProjVoice[1], confidence: 0.86, payload: {} };
  }
  const projectOnly = norm.match(/^project\s+(.+)$/);
  if (projectOnly) {
    return { handled: true, action: 'select', objectType: 'project', objectName: projectOnly[1], confidence: 0.82, payload: {} };
  }

  if (norm === 'select report type') {
    return { handled: true, action: 'select', objectType: 'report_type', confidence: 0.85, payload: { prompt: true } };
  }
  const reportType = norm.match(/^select report type\s+(.+)$/);
  if (reportType) {
    return { handled: true, action: 'select', objectType: 'report_type', objectName: reportType[1], confidence: 0.86, payload: {} };
  }

  return out;
}

function _scrollActiveModal(direction) {
  const sel = direction === 'down'
    ? ['.atlas-report-modal:not(.hidden) .atlas-report-modal-body', '.atlas-agent-office-reports-wrap', '.atlas-project-hq-content', '.atlas-hq-modal-body']
    : ['.atlas-report-modal:not(.hidden) .atlas-report-modal-body', '.atlas-agent-office-reports-wrap', '.atlas-project-hq-content', '.atlas-hq-modal-body'];
  for (const s of sel) {
    const el = document.querySelector(s);
    if (el) {
      el.scrollBy({ top: direction === 'down' ? 220 : -220, behavior: 'smooth' });
      return true;
    }
  }
  return false;
}

async function _executeParsed(parsed) {
  const ctx = AtlasVoiceContext.get();
  const uiAgents = window.AtlasAgentsUI;
  const uiProjects = window.AtlasProjectsUI;

  if (parsed.action === 'cancel_message') {
    clearMessageCapture();
    return cmdHandled(true, 'Message cancelled.');
  }

  if (parsed.action === 'finish_message') {
    if (!_capture?.message) return cmdHandled(false, 'No message to send yet.');
    const agentId = _capture.agentId || ctx.currentAgentId;
    if (!agentId) return cmdHandled(false, 'No agent selected.');
    const res = await uiAgents?.sendAgentMessage?.(
      agentId,
      _capture.message,
      _capture.projectId || ctx.currentProjectId,
      _capture.reportType || AGENT_DEFAULT_REPORT[agentId],
    );
    clearMessageCapture();
    return cmdHandled(!!res?.ok, res?.message || (res?.ok ? 'Report generated.' : 'Failed to send message.'));
  }

  if (parsed.action === 'message') {
    const agentId = parsed.objectName || ctx.currentAgentId || _resolveAgent(parsed.objectName);
    if (!agentId) return cmdHandled(false, 'Which agent, sir?');

    if (parsed.payload?.direct || (parsed.payload?.message && !parsed.payload?.append)) {
      const msg = parsed.payload.message;
      const res = await uiAgents?.sendAgentMessage?.(
        agentId,
        msg,
        ctx.currentProjectId,
        AGENT_DEFAULT_REPORT[agentId],
      );
      clearMessageCapture();
      return cmdHandled(!!res?.ok, res?.message || (res?.ok ? 'Generating report.' : 'Message failed.'));
    }

    if (parsed.payload?.append) {
      _capture.message = [_capture.message, parsed.payload.message].filter(Boolean).join(' ').trim();
      return cmdHandled(true, 'Message captured. Say finish message to send, or cancel message.');
    }

    if (parsed.payload?.startCapture || !parsed.payload?.message) {
      await uiAgents?.openAgent?.(agentId);
      uiAgents?.focusAgentMessage?.(agentId);
      _capture = {
        mode: 'message_body',
        agentId,
        message: '',
        projectId: ctx.currentProjectId || null,
        reportType: AGENT_DEFAULT_REPORT[agentId],
      };
      const name = ctx.currentAgentName || agentId;
      return cmdHandled(true, `What should I send to ${name}?`);
    }
  }

  if (parsed.action === 'close') {
    const closed = await uiAgents?.closeActiveModal?.();
    if (closed) return cmdHandled(true, 'Closed.');
    return cmdHandled(false, 'Nothing to close.');
  }

  if (parsed.action === 'scroll') {
    const ok = _scrollActiveModal(parsed.payload?.direction || 'down');
    return cmdHandled(ok, ok ? 'Scrolling.' : 'No scrollable panel open.');
  }

  if (parsed.action === 'open' && parsed.objectType === 'route') {
    return atlasVoiceNavigation.tryHandleNavigation(`move to ${parsed.objectName}`);
  }

  if (parsed.objectType === 'project') {
    const projects = await _fetchProjects();
    let proj = null;
    if (parsed.objectName) proj = await _resolveProject(parsed.objectName, projects);
    if (!proj && ctx.currentProjectId) proj = projects.find((p) => p.id === ctx.currentProjectId);

    if (parsed.payload?.prompt && !proj) {
      _awaiting = 'project_name';
      return cmdHandled(true, 'Which project, sir?');
    }
    if (!proj) return cmdHandled(false, 'Project not found.');

    if (parsed.action === 'select') {
      await uiProjects?.selectProject?.(proj.id);
      return cmdHandled(true, `${proj.name} selected.`);
    }
    if (parsed.action === 'open') {
      await uiProjects?.selectProject?.(proj.id);
      if (parsed.payload?.openHq !== false) await uiProjects?.openProjectHQ?.(proj.id);
      return cmdHandled(true, `Opening ${proj.name}.`);
    }
    if (parsed.action === 'deep_index') {
      const res = await fetch(`/api/atlas/projects/${proj.id}/deep-index`, { method: 'POST', credentials: 'same-origin' }).then((r) => r.json());
      return cmdHandled(!!res.ok, res.message || `Deep indexing ${proj.name}.`);
    }
    if (parsed.action === 'generate') {
      const path = parsed.payload?.kind === 'launch_plan'
        ? `/api/atlas/projects/${proj.id}/create-launch-plan`
        : `/api/atlas/projects/${proj.id}/generate-cursor-prompt`;
      const res = await fetch(path, { method: 'POST', credentials: 'same-origin' }).then((r) => r.json());
      return cmdHandled(!!res.ok, res.message || 'Request sent.');
    }
    if (parsed.action === 'review') {
      await uiProjects?.selectProject?.(proj.id);
      const res = await fetch(`/api/atlas/projects/${proj.id}/council-review`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      }).then((r) => r.json());
      return cmdHandled(!!res.ok, res.message || 'Council review started.');
    }
  }

  if (parsed.objectType === 'agent') {
    const agentId = _resolveAgent(parsed.objectName) || parsed.objectName;
    if (!agentId) return cmdHandled(false, 'Agent not found.');
    await uiAgents?.openAgent?.(agentId);
    const agents = await fetch('/api/atlas/agents', { credentials: 'same-origin' }).then((r) => r.json()).catch(() => ({}));
    const agent = (agents.agents || []).find((a) => a.id === agentId);
    const label = agent?.name || agentId;
    return cmdHandled(true, `${label} selected.`);
  }

  if (parsed.objectType === 'report') {
    if (parsed.action === 'open') {
      if (parsed.objectName === 'latest') {
        const ok = await uiAgents?.openLatestReport?.(ctx.currentAgentId);
        return cmdHandled(!!ok, ok ? 'Opening latest report.' : 'No report found.');
      }
      const ok = await uiAgents?.openReportByTitle?.(parsed.objectName, ctx.currentAgentId);
      return cmdHandled(!!ok, ok ? 'Opening report.' : 'Report not found.');
    }
    if (['approve', 'revise', 'archive', 'send_next'].includes(parsed.action)) {
      const reportId = ctx.currentReportId;
      if (!reportId) return cmdHandled(false, 'No report open.');
      if (parsed.action === 'send_next') {
        const ok = await uiAgents?.actOnReport?.(reportId, 'send_next');
        return cmdHandled(!!ok, ok ? 'Sent to next agent.' : 'Send failed.');
      }
      const ok = await uiAgents?.actOnReport?.(reportId, parsed.action);
      const labels = { approve: 'Approved.', revise: 'Revision requested.', archive: 'Archived.' };
      return cmdHandled(!!ok, ok ? labels[parsed.action] : 'Action failed.');
    }
    if (parsed.action === 'summarise') {
      const summary = document.getElementById('atlas-report-modal-summary')?.textContent
        || document.getElementById('atlas-report-modal-body')?.textContent?.slice(0, 400);
      return cmdHandled(true, summary || 'No summary available.');
    }
  }

  if (parsed.objectType === 'report_type') {
    const agentId = ctx.currentAgentId;
    if (!agentId) return cmdHandled(false, 'Select an agent first.');
    let typeId = null;
    const q = _norm(parsed.objectName || '');
    for (const [id, labels] of Object.entries(REPORT_TYPES)) {
      if (labels.some((l) => q.includes(l) || l.includes(q))) { typeId = id; break; }
    }
    if (!typeId && parsed.payload?.prompt) {
      return cmdHandled(true, 'Say a report type: research report, business proposal, architecture plan, developer cursor prompt, or marketing launch plan.');
    }
    if (typeId) {
      uiAgents?.setAgentReportType?.(agentId, typeId);
      if (_capture) _capture.reportType = typeId;
      return cmdHandled(true, 'Report type selected.');
    }
    return cmdHandled(false, 'Report type not recognized.');
  }

  if (parsed.action === 'open' && parsed.objectName === 'project_hq') {
    const pid = parsed.payload?.projectId || ctx.currentProjectId;
    if (!pid) return cmdHandled(false, 'No project selected.');
    await uiProjects?.openProjectHQ?.(pid);
    return cmdHandled(true, 'Opening Project HQ.');
  }

  return cmdUnhandled();
}

export async function tryHandleVoiceAction(transcript) {
  const ctx = AtlasVoiceContext.get();
  _debug('transcript', transcript);
  _debug('context', ctx);

  const parsed = parseVoiceAction(transcript, ctx);
  _debug('parsed', parsed);

  if (!parsed.handled) {
    if (_capture?.mode === 'message_body') {
      const fallback = parseVoiceAction(transcript, ctx);
      if (!fallback.handled) {
        _capture.message = [_capture.message, transcript.trim()].filter(Boolean).join(' ').trim();
        return cmdHandled(true, 'Message captured. Say finish message to send, or cancel message.');
      }
    }
    return cmdUnhandled();
  }

  const result = await _executeParsed(parsed);
  _debug('executed', result);
  _debug('handled', result?.handled);
  if (_awaiting && parsed.objectType === 'project' && parsed.objectName) _awaiting = null;
  return result;
}

const atlasVoiceActions = {
  parseVoiceAction,
  tryHandleVoiceAction,
  getMessageCaptureState,
  clearMessageCapture,
};

export default atlasVoiceActions;
