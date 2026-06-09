// Atlas OS — Project Command Centre (full-screen HQ)

import atlasActiveProject from './atlasActiveProject.js';
import AtlasVoiceContext from './atlasVoiceContext.js';

let _deps = {};
let _data = null;
let _projectId = null;
let _desktopStatus = null;

function _el(id) {
  return document.getElementById(id);
}

function _esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _fmtDate(ts) {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString();
  } catch (_) {
    return String(ts).slice(0, 16);
  }
}

async function _fetchJson(url, opts = {}) {
  const res = await fetch(url, { credentials: 'same-origin', ...opts });
  return res.json();
}

async function _refreshDesktopStatus() {
  try {
    _desktopStatus = await _fetchJson('/api/atlas/desktop/status');
  } catch (_) {
    _desktopStatus = { enabled: false, bridge_ready: false, message: 'Desktop status unavailable' };
  }
  return _desktopStatus;
}

function _desktopReady() {
  return _desktopStatus?.state === 'ready' || (_desktopStatus?.enabled && _desktopStatus?.bridge_ready);
}

async function _desktopCommand(command, args = {}) {
  const res = await _fetchJson('/api/atlas/desktop/command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command, args }),
  });
  _deps.showToast?.(res.message || (res.ok ? 'Desktop command sent' : 'Desktop command failed'));
  return res;
}

function _scoreBar(label, value) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  return `
    <div class="atlas-hq-score-row">
      <span class="atlas-hq-score-label">${_esc(label)}</span>
      <div class="atlas-hq-score-track"><div class="atlas-hq-score-fill" style="width:${v}%"></div></div>
      <span class="atlas-hq-score-val">${v}</span>
    </div>`;
}

function _renderPipeline(stages = []) {
  if (!stages.length) return '<p class="atlas-panel-empty">Council pipeline not configured.</p>';
  return `<div class="atlas-hq-pipeline">${stages.map(s => `
    <div class="atlas-hq-pipeline-stage" data-stage-status="${_esc(s.status)}">
      <div class="atlas-hq-pipeline-head">
        <span class="atlas-hq-pipeline-label">${_esc(s.label || s.stage)}</span>
        <span class="atlas-hq-pipeline-badge">${_esc(s.status || 'not_started')}</span>
      </div>
      ${s.latest_report ? `<p class="atlas-hq-pipeline-report">${_esc(s.latest_report.title || 'Report')}</p>` : '<p class="atlas-hq-pipeline-report atlas-panel-empty">No report yet</p>'}
      ${s.can_send_next ? `<button type="button" class="atlas-project-btn atlas-hq-pipeline-send" data-hq-council-stage="${_esc(s.next_stage || '')}">Send to next agent</button>` : ''}
    </div>`).join('')}</div>`;
}

function _renderReports(groups = []) {
  if (!groups.length) return '<p class="atlas-panel-empty">No reports linked to this project yet.</p>';
  return groups.map(g => `
    <section class="atlas-hq-report-group">
      <h4>${_esc(g.agent_id || 'agent')}</h4>
      <ul>${(g.reports || []).map(r => `
        <li class="atlas-hq-report-item">
          <span>${_esc(r.title || 'Report')}</span>
          <span class="atlas-hq-report-badge">${_esc(r.status || '')}</span>
          <button type="button" class="atlas-project-btn atlas-hq-report-open" data-hq-report-id="${_esc(r.id)}">Open Report</button>
          <button type="button" class="atlas-project-btn" data-hq-ask-report="${_esc(r.id)}">Ask Atlas</button>
        </li>`).join('')}</ul>
    </section>`).join('');
}

function _render() {
  const shell = _el('atlas-project-hq');
  if (!shell || !_data?.ok) return;
  const p = _data.project || {};
  const score = _data.score || {};
  const stage = _data.stage || {};
  const ch = _data.recent_changes || {};
  const rec = _data.recommendation || {};
  const desktop = _data.desktop || {};
  const ready = _desktopReady() && desktop.can_open_folder;

  _el('atlas-hq-title').textContent = p.name || 'Project';
  _el('atlas-hq-subtitle').textContent = [
    p.detected_type || p.type || 'Project',
    (p.detected_stack || []).slice(0, 3).join(' · '),
    stage.current ? `Stage: ${stage.current}` : '',
  ].filter(Boolean).join(' · ');

  const meta = _el('atlas-hq-meta');
  if (meta) {
    meta.innerHTML = `
      <span>Potential <strong>${p.potential_score ?? score.overall ?? '—'}/100</strong></span>
      <span>Last indexed ${_fmtDate(p.last_indexed_at)}</span>
      <span>Activity ${_esc(p.last_activity_label || '—')}</span>
      <span>Path ${_esc(p.display_path || p.path || '—')}</span>`;
  }

  const pinBtn = _el('atlas-hq-pin');
  if (pinBtn) pinBtn.textContent = p.pinned ? 'Unpin' : 'Pin';
  const activeBtn = _el('atlas-hq-make-active');
  if (activeBtn) {
    activeBtn.textContent = p.is_active_context ? 'Active Project ✓' : 'Make Active Project';
    activeBtn.classList.toggle('atlas-project-btn--primary', !p.is_active_context);
  }

  const staleEl = _el('atlas-hq-stale');
  if (staleEl) {
    staleEl.classList.toggle('hidden', !rec.stale_index);
    staleEl.textContent = rec.stale_message || '';
  }

  const scoreEl = _el('atlas-hq-scores');
  if (scoreEl) {
    scoreEl.innerHTML = `
      <div class="atlas-hq-overall">${score.overall ?? 0}<span>/100</span></div>
      ${_scoreBar('Launch readiness', score.launch_readiness)}
      ${_scoreBar('Monetisation clarity', score.monetisation_clarity)}
      ${_scoreBar('Technical readiness', score.technical_readiness)}
      ${_scoreBar('Marketability', score.marketability)}
      ${_scoreBar('Recent activity', score.recent_activity)}
      ${_scoreBar('AI automation potential', score.ai_automation_potential)}`;
  }

  const stageEl = _el('atlas-hq-stage');
  if (stageEl) {
    stageEl.innerHTML = `
      <p class="atlas-hq-stage-current">${_esc(stage.current || 'unknown')}</p>
      <p class="atlas-hq-stage-expl">${_esc(stage.explanation || '')}</p>
      <p class="atlas-hq-stage-next"><strong>Recommended next:</strong> ${_esc(stage.recommended_next_stage || '—')}</p>`;
  }

  const changesEl = _el('atlas-hq-changes');
  if (changesEl) {
    const files = (ch.recent_files || []).slice(0, 8);
    changesEl.innerHTML = `
      <p><strong>${ch.changed_file_count || 0}</strong> changed files
        (${ch.new_count || 0} new · ${ch.modified_count || 0} modified)</p>
      ${ch.last_modified ? `<p>Last modified ${_fmtDate(ch.last_modified)}</p>` : ''}
      ${files.length ? `<ul>${files.map(f => `<li>${_esc(f)}</li>`).join('')}</ul>` : '<p class="atlas-panel-empty">No recent file list — run Deep Index.</p>'}`;
  }

  const pipeEl = _el('atlas-hq-pipeline');
  if (pipeEl) pipeEl.innerHTML = _renderPipeline(_data.pipeline?.stages || []);

  const reportsEl = _el('atlas-hq-reports');
  if (reportsEl) reportsEl.innerHTML = _renderReports(_data.latest_reports || []);

  const recEl = _el('atlas-hq-recommendation');
  if (recEl) recEl.textContent = rec.do_this_next || '—';

  const deskStatus = _el('atlas-hq-desktop-status');
  if (deskStatus) {
    const st = _desktopStatus || {};
    deskStatus.textContent = st.label || st.message || desktop.reason || 'Desktop bridge disabled';
  }
  const deskMeta = _el('atlas-hq-desktop-meta');
  if (deskMeta) {
    const st = _desktopStatus || {};
    const ready = _desktopReady();
    const avail = (st.available_apps || []).length;
    const total = st.app_count;
    deskMeta.textContent = ready && total != null ? `${avail}/${total} apps available` : '';
  }

  shell.querySelectorAll('[data-hq-desktop]').forEach(btn => {
    btn.disabled = !ready;
    btn.title = ready ? '' : (desktop.reason || _desktopStatus?.message || 'Desktop not ready');
  });
}

export async function openProjectHQ(projectId) {
  if (!projectId) return;
  _projectId = projectId;
  const shell = _el('atlas-project-hq');
  if (!shell) return;

  shell.classList.remove('hidden');
  shell.setAttribute('aria-hidden', 'false');
  shell.dataset.projectId = projectId;

  AtlasVoiceContext.set({
    currentModal: 'project_hq',
    currentProjectId: projectId,
    currentProjectName: null,
  });

  _el('atlas-hq-loading')?.classList.remove('hidden');
  _el('atlas-hq-content')?.classList.add('hidden');

  await _refreshDesktopStatus();
  const data = await _fetchJson(`/api/atlas/projects/${projectId}/command-centre`);
  _data = data;
  if (!data.ok) {
    _deps.showToast?.(data.message || 'Could not load Project Command Centre');
    closeProjectHQ();
    return;
  }

  _el('atlas-hq-loading')?.classList.add('hidden');
  _el('atlas-hq-content')?.classList.remove('hidden');
  _render();
  if (_data?.project?.name) {
    AtlasVoiceContext.set({
      currentProjectName: _data.project.name,
      currentSelectionLabel: _data.project.name,
    });
  }
}

export function closeProjectHQ() {
  const shell = _el('atlas-project-hq');
  if (shell) {
    shell.classList.add('hidden');
    shell.setAttribute('aria-hidden', 'true');
  }
  _data = null;
  _projectId = null;
  if (AtlasVoiceContext.get().currentModal === 'project_hq') {
    AtlasVoiceContext.clear('modal');
  }
}

async function _postAction(path) {
  const res = await _fetchJson(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  _deps.showToast?.(res.message || (res.ok ? 'Done' : 'Action failed'));
  if (res.ok && _projectId) await openProjectHQ(_projectId);
  return res;
}

function _bindEvents() {
  const shell = _el('atlas-project-hq');
  if (!shell || shell.dataset.bound) return;
  shell.dataset.bound = '1';

  shell.addEventListener('click', async (e) => {
    if (e.target.closest('[data-hq-close]')) { closeProjectHQ(); return; }
    const pid = shell.dataset.projectId;
    if (!pid) return;

    if (e.target.closest('[data-hq-deep-index]')) {
      await _postAction(`/api/atlas/projects/${pid}/deep-index`);
      return;
    }
    if (e.target.closest('[data-hq-council]')) {
      await _postAction(`/api/atlas/projects/${pid}/council-review`);
      return;
    }
    if (e.target.closest('[data-hq-cursor-prompt]')) {
      await _postAction(`/api/atlas/projects/${pid}/generate-cursor-prompt`);
      return;
    }
    if (e.target.closest('[data-hq-launch-plan]')) {
      await _postAction(`/api/atlas/projects/${pid}/create-launch-plan`);
      return;
    }
    if (e.target.closest('[data-hq-make-active]')) {
      const res = await _postAction(`/api/atlas/projects/${pid}/make-active`);
      if (res.ok && res.project) atlasActiveProject.setActiveProject(res.project);
      return;
    }
    if (e.target.closest('[data-hq-pin]')) {
      const res = await _fetchJson(`/api/atlas/projects/${pid}/pin`, { method: 'POST' });
      if (res.ok) await openProjectHQ(pid);
      _deps.showToast?.(res.pinned ? 'Pinned' : 'Unpinned');
      return;
    }
    if (e.target.closest('[data-hq-ask-project]')) {
      atlasActiveProject.openAssistantWithProject(pid, _data?.project?.name);
      return;
    }
    const reportBtn = e.target.closest('[data-hq-report-id]');
    if (reportBtn) {
      const mod = await import('./agentsOffice.js');
      mod.default.openReport?.(reportBtn.dataset.hqReportId);
      return;
    }
    const stageBtn = e.target.closest('[data-hq-council-stage]');
    if (stageBtn?.dataset.hqCouncilStage) {
      const res = await _fetchJson(`/api/atlas/projects/${pid}/council-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: stageBtn.dataset.hqCouncilStage }),
      });
      _deps.showToast?.(res.message || (res.ok ? 'Council stage started' : 'Failed'));
      if (res.ok) await openProjectHQ(pid);
      return;
    }
    if (e.target.closest('[data-hq-desktop="cursor"]')) {
      await _desktopCommand('open_project_in_cursor', { project_id: pid });
      return;
    }
    if (e.target.closest('[data-hq-desktop="folder"]')) {
      await _desktopCommand('open_folder', { project_id: pid });
      return;
    }
    if (e.target.closest('[data-hq-desktop="chrome"]')) {
      await _desktopCommand('open_app', { app: 'chrome' });
      return;
    }
    if (e.target.closest('[data-hq-desktop="brave"]')) {
      await _desktopCommand('open_app', { app: 'brave' });
      return;
    }
    if (e.target.closest('[data-hq-desktop-setup]')) {
      const hint = _desktopStatus?.setup_hint || 'See desktop_bridge/README.md on the host.';
      window.alert(hint);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !shell.classList.contains('hidden')) closeProjectHQ();
  });
}

export function initAtlasProjectHQ(deps = {}) {
  _deps = deps;
  _bindEvents();
}

const atlasProjectHQ = {
  openProjectHQ,
  closeProjectHQ,
  initAtlasProjectHQ,
};

export default atlasProjectHQ;
