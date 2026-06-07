// Atlas OS — Projects module + Docker-mounted Atlas Workspace

import workspaceModule from './workspace.js';
import atlasActiveProject from './atlasActiveProject.js';
import atlasProjectContext from './atlasProjectContext.js';

let _projects = [];
let _detailCtx = null;
let _workspace = {};
let _status = {};
let _selectedId = null;
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

async function _fetchWorkspace() {
  const res = await fetch('/api/atlas/workspace', { credentials: 'same-origin' });
  const data = await res.json();
  _workspace = data.workspace || {};
  _status = data.status || {};
  if (Array.isArray(data.projects)) _projects = data.projects;
  return data;
}

async function _fetchProjects() {
  const res = await fetch('/api/atlas/projects', { credentials: 'same-origin' });
  const data = await res.json();
  _projects = Array.isArray(data.projects) ? data.projects : [];
  return _projects;
}

function _renderWorkspace() {
  const mounted = !!_status.mounted;
  const badge = _el('atlas-workspace-mount-badge');
  const warn = _el('atlas-workspace-warning');
  const host = _el('atlas-workspace-host-hint');
  const container = _el('atlas-workspace-container-root');
  const projectsFolder = _el('atlas-workspace-projects-folder');
  const rootHidden = _el('atlas-workspace-root');
  const auto = _el('atlas-workspace-auto-discover');
  const autoIndex = _el('atlas-workspace-auto-index');
  const meta = _el('atlas-workspace-meta');
  const discovered = _el('atlas-workspace-discovered');

  if (badge) {
    badge.textContent = mounted ? 'Mounted' : 'Not mounted';
    badge.classList.toggle('atlas-workspace-mount-badge--ok', mounted);
    badge.classList.toggle('atlas-workspace-mount-badge--warn', !mounted);
  }
  if (host) host.textContent = _status.host_hint || _workspace.workspace_host_root_hint || 'C:\\AtlasWorkspace';
  if (container) container.textContent = _status.container_root || _workspace.workspace_container_root || '/workspace';
  if (projectsFolder) {
    projectsFolder.textContent = _status.projects_folder || _workspace.workspace_root || '/workspace/Projects';
  }
  if (rootHidden) rootHidden.value = _workspace.workspace_root || '/workspace/Projects';
  if (auto) auto.checked = _workspace.auto_discover !== false;
  if (autoIndex) autoIndex.checked = !!_workspace.auto_index_on_scan;

  if (warn) {
    const msg = _status.warning || '';
    if (msg && !mounted) {
      warn.textContent = msg;
      warn.classList.remove('hidden');
    } else {
      warn.textContent = '';
      warn.classList.add('hidden');
    }
  }

  if (meta) {
    meta.textContent = _workspace.last_scan_at
      ? `Last scan: ${new Date(_workspace.last_scan_at).toLocaleString()}`
      : 'Last scan: never — create workspace folders, add projects to C:\\AtlasWorkspace\\Projects, then Scan Projects';
  }
  if (discovered) {
    const valid = _projects.filter(p => p.path_status === 'valid');
    const indexed = valid.filter(p => p.last_indexed_at || p.indexed);
    discovered.textContent = valid.length
      ? `${valid.length} project(s) linked · ${indexed.length} indexed`
      : 'No projects discovered yet — scan after adding folders to your Atlas Workspace';
  }
}

function _changeCount(p) {
  const ch = p.recent_changes || {};
  return (ch.new_count || 0) + (ch.modified_count || 0) + (ch.deleted_count || 0);
}

function _pathLine(p) {
  if (p.path_status === 'invalid') {
    return '<p class="atlas-project-path atlas-project-path--invalid">unmounted / invalid path</p>';
  }
  const display = p.display_path || p.path || '';
  const container = p.path ? `<span class="atlas-project-path-container">${_esc(p.path)}</span>` : '';
  if (!display && !p.path) {
    return '<p class="atlas-project-path atlas-project-path--unset">No path linked</p>';
  }
  return `<p class="atlas-project-path" title="${_esc(p.path || '')}">${_esc(display)}${container ? `<br>${container}` : ''}</p>`;
}

function _renderCards() {
  const grid = _el('atlas-projects-grid');
  if (!grid) return;
  if (!_projects.length) {
    grid.innerHTML = '<p class="atlas-panel-empty">Add project folders to C:\\AtlasWorkspace\\Projects, then Scan Projects.</p>';
    return;
  }
  grid.innerHTML = _projects.map(p => {
    const stack = (p.detected_stack || []).join(' · ') || p.type || '—';
    const changes = _changeCount(p);
    const isIndexed = !!(p.last_indexed_at || p.indexed);
    const indexLabel = isIndexed
      ? `Last indexed ${new Date(p.last_indexed_at).toLocaleString()}`
      : 'Not indexed';
    const relinkBtn = p.can_relink
      ? `<button type="button" class="atlas-project-btn" data-relink-project="${_esc(p.id)}">Relink</button>`
      : '';
    return `
    <article class="atlas-project-card${p.id === _selectedId ? ' atlas-project-card--active' : ''}${p.path_status === 'invalid' ? ' atlas-project-card--invalid' : ''}" data-project-id="${_esc(p.id)}" tabindex="0">
      <header class="atlas-project-card-head">
        <h3 class="atlas-project-card-name">${_esc(p.name)}</h3>
        <span class="atlas-project-index-badge${isIndexed ? ' atlas-project-index-badge--yes' : ' atlas-project-index-badge--no'}">${isIndexed ? 'Indexed' : 'Not indexed'}</span>
      </header>
      ${_pathLine(p)}
      <p class="atlas-project-card-stack"><span class="atlas-project-card-stack-label">Stack</span> ${_esc(stack)}</p>
      <div class="atlas-project-card-stats">
        <span class="atlas-project-stat"><strong>${p.file_count || 0}</strong> files</span>
        <span class="atlas-project-stat"><strong>${changes}</strong> recent changes</span>
      </div>
      <p class="atlas-project-indexed">${_esc(indexLabel)}</p>
      <div class="atlas-project-card-actions">
        <button type="button" class="atlas-project-btn" data-index-project="${_esc(p.id)}"${p.path_status !== 'valid' ? ' disabled title="Relink or scan first"' : ''}>Index</button>
        <button type="button" class="atlas-project-btn" data-dev-review="${_esc(p.id)}">Developer Review</button>
        <button type="button" class="atlas-project-btn" data-open-summary="${_esc(p.id)}">Open Summary</button>
        ${relinkBtn}
      </div>
    </article>
  `;
  }).join('');
}

function _fmtBytes(n) {
  const b = Number(n) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function _detailActionsHtml(id) {
  return `
    <button type="button" class="atlas-project-btn" data-detail-ask="${_esc(id)}">Ask in Chat</button>
    <button type="button" class="atlas-project-btn" data-index-project="${_esc(id)}">Index</button>
    <button type="button" class="atlas-project-btn" data-dev-review="${_esc(id)}">Developer Review</button>
    <button type="button" class="atlas-project-btn" data-detail-architect="${_esc(id)}">Architect Plan</button>
    <button type="button" class="atlas-project-btn" data-detail-business="${_esc(id)}">Business Analysis</button>
    <button type="button" class="atlas-project-btn" data-detail-marketing="${_esc(id)}">Marketing Ideas</button>
    <button type="button" class="atlas-project-btn" data-open-summary="${_esc(id)}">Open Summary</button>
    <button type="button" class="atlas-project-btn" data-detail-pin="${_esc(id)}">Pin / Unpin</button>
  `;
}

async function _loadDetailContext(projectId) {
  try {
    const res = await fetch(`/api/atlas/projects/${projectId}/context`, { credentials: 'same-origin' });
    _detailCtx = await res.json();
  } catch (_) {
    _detailCtx = null;
  }
}

function _renderDetail() {
  const p = _projects.find(x => x.id === _selectedId);
  const changesEl = _el('atlas-projects-changes');
  const detailBody = _el('atlas-projects-detail-body');
  const detailName = _el('atlas-projects-detail-name');
  const detailActions = _el('atlas-projects-detail-actions');
  if (!p) {
    if (changesEl) changesEl.innerHTML = '<p class="atlas-panel-empty">Select a project.</p>';
    if (detailBody) detailBody.innerHTML = '<p class="atlas-panel-empty">Select a project.</p>';
    if (detailActions) detailActions.classList.add('hidden');
    return;
  }
  if (detailName) detailName.textContent = p.name;
  const ctx = _detailCtx?.ok && _detailCtx.project?.id === p.id ? _detailCtx : null;
  const meta = ctx?.index_meta || {};
  const fin = ctx?.finance || {};
  const potential = ctx?.potential_score ?? '—';
  const direction = ctx?.proposed_direction || 'Run Architect Plan or Business Analysis to generate a proper direction.';
  if (detailBody) {
    detailBody.innerHTML = `
      <p class="atlas-detail-path">${_esc(p.display_path || p.path || 'No path')}</p>
      <p><strong>Stack</strong> ${_esc((p.detected_stack || []).join(' · ') || p.type || '—')}</p>
      <p><strong>Files</strong> ${meta.file_count || p.file_count || 0} · ${_fmtBytes(meta.folder_size_bytes)}</p>
      <p><strong>Indexed</strong> ${p.last_indexed_at ? new Date(p.last_indexed_at).toLocaleString() : 'Not indexed'}</p>
      <p><strong>Changes</strong> ${_changeCount(p)}</p>
      <p><strong>Potential</strong> ${potential}/100</p>
      <p class="atlas-detail-direction">${_esc(direction)}</p>
      ${fin.monetisation_strategy ? `<p><strong>Monetisation</strong> ${_esc(fin.monetisation_strategy.slice(0, 160))}</p>` : ''}
      ${ctx?.reports?.length ? `<p><strong>Reports</strong> ${ctx.reports.length} recent</p>` : ''}
    `;
  }
  if (detailActions) {
    detailActions.innerHTML = _detailActionsHtml(p.id);
    detailActions.classList.remove('hidden');
  }
  const ch = p.recent_changes || {};
  if (changesEl) {
    const sections = [
      ['New', ch.new_files || []],
      ['Modified', ch.modified_files || []],
      ['Deleted', ch.deleted_files || []],
    ];
    changesEl.innerHTML = sections.map(([label, files]) => `
      <section class="atlas-changes-section">
        <h4>${label} (${files.length})</h4>
        <ul>${files.length ? files.slice(0, 12).map(f => `<li>${_esc(f)}</li>`).join('') : '<li class="atlas-panel-empty">None</li>'}</ul>
      </section>
    `).join('');
    if (p.last_indexed_at) {
      changesEl.insertAdjacentHTML('afterbegin', `<p class="atlas-indexed-at">Last indexed: ${new Date(p.last_indexed_at).toLocaleString()}</p>`);
    }
  }
}

async function _selectProject(id) {
  _selectedId = id;
  _renderCards();
  await _loadDetailContext(id);
  _renderDetail();
}

async function _saveWorkspace() {
  const body = {
    workspace_root: _el('atlas-workspace-root')?.value || '/workspace/Projects',
    auto_discover: !!_el('atlas-workspace-auto-discover')?.checked,
    auto_index_on_scan: !!_el('atlas-workspace-auto-index')?.checked,
  };
  const res = await fetch('/api/atlas/workspace', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (data.ok) {
    _workspace = data.workspace;
    _status = data.status || _status;
    _renderWorkspace();
    if (_deps.showToast) _deps.showToast('Workspace settings saved');
  }
}

async function _bootstrapWorkspace() {
  const res = await fetch('/api/atlas/workspace/bootstrap', {
    method: 'POST',
    credentials: 'same-origin',
  });
  const data = await res.json();
  if (data.ok) {
    _status = data.status || _status;
    _renderWorkspace();
    if (_deps.showToast) _deps.showToast(data.message || 'Workspace folders created');
  } else if (_deps.showToast) {
    _deps.showToast(data.message || 'Bootstrap failed');
  }
}

async function _scanWorkspace() {
  if (_deps.showToast) _deps.showToast('Scanning /workspace/Projects…');
  const res = await fetch('/api/atlas/workspace/scan', {
    method: 'POST',
    credentials: 'same-origin',
  });
  const data = await res.json();
  if (data.ok) {
    _workspace = data.workspace || _workspace;
    _status = data.status || _status;
    _projects = data.projects || _projects;
    _renderWorkspace();
    _renderCards();
    _renderDetail();
    let msg = data.message || 'Scan complete';
    if (data.indexed_count != null && data.indexed_count > 0) {
      msg += ` (${data.indexed_count} indexed`;
      if (data.skipped_count) msg += `, ${data.skipped_count} skipped`;
      msg += ')';
    }
    if (_deps.showToast) _deps.showToast(msg);
  } else {
    if (data.status) _status = data.status;
    _renderWorkspace();
    if (_deps.showToast) _deps.showToast(data.message || 'Scan failed');
  }
}

async function _indexAllProjects() {
  if (_deps.showToast) _deps.showToast('Indexing all projects…');
  const res = await fetch('/api/atlas/projects/index-all', {
    method: 'POST',
    credentials: 'same-origin',
  });
  const data = await res.json();
  if (data.ok) {
    _projects = data.projects || _projects;
    _renderWorkspace();
    _renderCards();
    _renderDetail();
    let msg = data.message || 'Index complete';
    if (data.errors?.length) msg += ` (${data.errors.length} error(s))`;
    if (_deps.showToast) _deps.showToast(msg);
  } else if (_deps.showToast) {
    _deps.showToast(data.message || 'Index all failed');
  }
}

function _browseWorkspaceRoot() {
  if (!_status.mounted) {
    if (_deps.showToast) _deps.showToast(_status.warning || 'Atlas Workspace is not mounted');
    return;
  }
  const start = _status.browse_start || _status.container_root || '/workspace';
  workspaceModule.openWorkspaceBrowser({
    startPath: start,
    onSelect: () => {
      if (_deps.showToast) _deps.showToast('Projects are discovered from /workspace/Projects — use Scan Projects');
    },
  });
}

function _openSetupModal() {
  const modal = _el('atlas-workspace-setup-modal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
  }
}

function _closeSetupModal() {
  const modal = _el('atlas-workspace-setup-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
  }
}

async function _relinkProject(id) {
  const res = await fetch(`/api/atlas/projects/${id}/relink`, {
    method: 'POST',
    credentials: 'same-origin',
  });
  const data = await res.json();
  if (data.ok) {
    if (data.project) {
      const i = _projects.findIndex(p => p.id === id);
      if (i >= 0) _projects[i] = data.project;
    } else if (data.projects) {
      _projects = data.projects;
    }
    _renderCards();
    _renderDetail();
    if (_deps.showToast) _deps.showToast(data.message || 'Project relinked');
  } else if (_deps.showToast) {
    _deps.showToast(data.message || 'Relink failed — scan projects first');
  }
}

function _showForm(project = null) {
  const form = _el('atlas-project-form');
  if (!form) return;
  form.classList.remove('hidden');
  _el('atlas-project-form-id').value = project?.id || '';
  _el('atlas-project-form-name').value = project?.name || '';
  _el('atlas-project-form-path').value = project?.path || '';
  _el('atlas-project-form-desc').value = project?.description || '';
  _el('atlas-project-form-type').value = project?.type || 'SaaS';
  _el('atlas-project-form-status').value = project?.status || 'active';
  _el('atlas-project-form-priority').value = project?.priority || 'medium';
}

async function _saveProject(e) {
  e.preventDefault();
  const body = {
    id: _el('atlas-project-form-id')?.value || undefined,
    name: _el('atlas-project-form-name')?.value,
    path: _el('atlas-project-form-path')?.value,
    description: _el('atlas-project-form-desc')?.value,
    type: _el('atlas-project-form-type')?.value,
    status: _el('atlas-project-form-status')?.value,
    priority: _el('atlas-project-form-priority')?.value,
  };
  const res = await fetch('/api/atlas/projects', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (data.ok) {
    _projects = data.projects || _projects;
    _selectedId = data.project?.id || _selectedId;
    _el('atlas-project-form')?.classList.add('hidden');
    _renderCards();
    _renderDetail();
    if (_deps.showToast) _deps.showToast('Project saved');
  }
}

async function _indexProject(id) {
  const card = document.querySelector(`[data-project-id="${id}"]`);
  if (card) card.classList.add('atlas-project-card--indexing');
  try {
    const res = await fetch('/api/atlas/projects/index', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: id }),
    });
    const data = await res.json();
    if (data.ok) {
      if (data.project) {
        const i = _projects.findIndex(p => p.id === id);
        if (i >= 0) _projects[i] = data.project;
      }
      _selectedId = id;
      _renderCards();
      _renderDetail();
      if (_deps.showToast) _deps.showToast(data.briefing || data.summary?.summary || 'Index complete');
    } else if (_deps.showToast) {
      _deps.showToast(data.message || 'Index failed');
    }
  } finally {
    if (card) card.classList.remove('atlas-project-card--indexing');
  }
}

async function _runAgent(agentId, action, projectId) {
  const res = await fetch('/api/atlas/agents/run', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent_id: agentId, action, project_id: projectId }),
  });
  const data = await res.json();
  if (_deps.showToast) _deps.showToast(data.message || (data.ok ? 'Report queued' : 'Failed'));
}

async function _developerReview(id) {
  try {
    const res = await fetch('/api/atlas/agents/run', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_id: 'developer',
        action: 'developer_project_review',
        project_id: id,
      }),
    });
    const data = await res.json();
    if (_deps.showToast) _deps.showToast(data.message || (data.ok ? 'Review queued' : 'Failed'));
  } catch (_) {
    if (_deps.showToast) _deps.showToast('Developer review failed');
  }
}

function _closeSummaryModal() {
  const modal = _el('atlas-project-summary-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
  }
}

async function _openSummary(id) {
  const res = await fetch(`/api/atlas/projects/${id}/summary`, { credentials: 'same-origin' });
  const data = await res.json();
  const modal = _el('atlas-project-summary-modal');
  if (!data.ok || !modal) {
    if (_deps.showToast) _deps.showToast(data.message || 'Index project first to generate summary');
    return;
  }
  const s = data.summary;
  const p = _projects.find(x => x.id === id);
  _el('atlas-project-summary-agent').textContent = (p?.detected_stack || []).join(' · ') || 'Project';
  _el('atlas-project-summary-title').textContent = s.name || p?.name || 'Summary';
  _el('atlas-project-summary-meta').textContent = [
    s.last_indexed_at ? new Date(s.last_indexed_at).toLocaleString() : '',
    `${s.file_count || 0} files`,
    s.ignored_count ? `${s.ignored_count} ignored` : '',
  ].filter(Boolean).join(' · ');
  _el('atlas-project-summary-text').textContent = s.summary || '';
  const body = _el('atlas-project-summary-body');
  if (body) {
    const imp = (s.important_files || []).map(f => `<li>${_esc(f)}</li>`).join('') || '<li>None</li>';
    const ch = (s.recent_changes || []).map(f => `<li>${_esc(f)}</li>`).join('') || '<li>None</li>';
    const qs = (s.next_questions || []).map(q => `<li>${_esc(q)}</li>`).join('');
    body.innerHTML = `
      <h3>Important files</h3><ul>${imp}</ul>
      <h3>Recent changes</h3><ul>${ch}</ul>
      ${qs ? `<h3>Suggested next steps</h3><ul>${qs}</ul>` : ''}
    `;
  }
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
}

function _bindEvents() {
  _el('atlas-workspace-save')?.addEventListener('click', _saveWorkspace);
  _el('atlas-workspace-scan')?.addEventListener('click', _scanWorkspace);
  _el('atlas-workspace-index-all')?.addEventListener('click', _indexAllProjects);
  _el('atlas-workspace-browse')?.addEventListener('click', _browseWorkspaceRoot);
  _el('atlas-workspace-bootstrap')?.addEventListener('click', _bootstrapWorkspace);
  _el('atlas-workspace-setup')?.addEventListener('click', _openSetupModal);
  _el('atlas-workspace-auto-discover')?.addEventListener('change', _saveWorkspace);
  _el('atlas-workspace-auto-index')?.addEventListener('change', _saveWorkspace);
  _el('atlas-projects-add-btn')?.addEventListener('click', () => _showForm());
  _el('atlas-project-form-cancel')?.addEventListener('click', () => _el('atlas-project-form')?.classList.add('hidden'));
  _el('atlas-project-form')?.addEventListener('submit', _saveProject);

  const panel = _el('atlas-projects-panel');
  if (panel) {
    panel.addEventListener('click', (e) => {
      const indexBtn = e.target.closest('[data-index-project]');
      if (indexBtn && !indexBtn.disabled) { _indexProject(indexBtn.dataset.indexProject); return; }
      const reviewBtn = e.target.closest('[data-dev-review]');
      if (reviewBtn) { _developerReview(reviewBtn.dataset.devReview); return; }
      const summaryBtn = e.target.closest('[data-open-summary]');
      if (summaryBtn) { _openSummary(summaryBtn.dataset.openSummary); return; }
      const relinkBtn = e.target.closest('[data-relink-project]');
      if (relinkBtn) { _relinkProject(relinkBtn.dataset.relinkProject); return; }
      const askBtn = e.target.closest('[data-detail-ask]');
      if (askBtn) {
        const p = _projects.find(x => x.id === askBtn.dataset.detailAsk);
        atlasActiveProject.openAssistantWithProject(askBtn.dataset.detailAsk, p?.name);
        return;
      }
      const archBtn = e.target.closest('[data-detail-architect]');
      if (archBtn) { _runAgent('architect', 'architecture_plan', archBtn.dataset.detailArchitect); return; }
      const bizBtn = e.target.closest('[data-detail-business]');
      if (bizBtn) { _runAgent('business', 'business_analysis', bizBtn.dataset.detailBusiness); return; }
      const mktBtn = e.target.closest('[data-detail-marketing]');
      if (mktBtn) { _runAgent('marketing', 'marketing_ideas', mktBtn.dataset.detailMarketing); return; }
      const pinBtn = e.target.closest('[data-detail-pin]');
      if (pinBtn) {
        fetch(`/api/atlas/projects/${pinBtn.dataset.detailPin}/pin`, { method: 'POST', credentials: 'same-origin' })
          .then(r => r.json()).then(async (d) => {
            if (d.ok) { await _fetchProjects(); _renderCards(); await _selectProject(pinBtn.dataset.detailPin); }
          });
        return;
      }
      const card = e.target.closest('[data-project-id]');
      if (card && !e.target.closest('button')) {
        _selectProject(card.dataset.projectId);
      }
    });
  }

  const setupModal = _el('atlas-workspace-setup-modal');
  if (setupModal) {
    setupModal.addEventListener('click', (e) => {
      if (e.target.closest('[data-atlas-setup-close]')) _closeSetupModal();
    });
  }

  const sumModal = _el('atlas-project-summary-modal');
  if (sumModal) {
    sumModal.addEventListener('click', (e) => {
      if (e.target.closest('[data-atlas-summary-close]')) _closeSummaryModal();
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      _closeSummaryModal();
      _closeSetupModal();
    }
  });
}

export async function renderProjectsPanel() {
  await _fetchWorkspace();
  if (!_projects.length) await _fetchProjects();
  _renderWorkspace();
  _renderCards();
  if (!_selectedId && _projects.length) await _selectProject(_projects[0].id);
  else if (_selectedId) {
    await _loadDetailContext(_selectedId);
    _renderDetail();
  }
}

export async function openProjectSummary(id) {
  return _openSummary(id);
}

export function initAtlasProjects(deps = {}) {
  _deps = deps;
  atlasProjectContext.initAtlasProjectContext({
    showToast: deps.showToast,
    openSummary: openProjectSummary,
  });
  _bindEvents();
}

const atlasProjectsModule = {
  initAtlasProjects,
  renderProjectsPanel,
  openProjectSummary,
};

export default atlasProjectsModule;
