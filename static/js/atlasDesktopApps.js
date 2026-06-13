// Atlas OS — Desktop Bridge app status viewer

let _deps = {};

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

async function _fetchJson(url, opts = {}) {
  const res = await fetch(url, { credentials: 'same-origin', ...opts });
  return res.json();
}

function _renderAppsTable(appsData) {
  const body = _el('atlas-desktop-apps-body');
  if (!body) return;
  const apps = appsData?.apps || {};
  const rows = Object.values(apps).sort((a, b) => String(a.display_name || a.id).localeCompare(String(b.display_name || b.id)));
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="5" class="atlas-desktop-apps-empty">No apps configured yet. Add apps in Settings → Desktop Bridge.</td></tr>';
    return;
  }
  body.innerHTML = rows.map((app) => {
    const available = !!app.available;
    const status = available ? 'available' : 'missing';
    const path = app.path || app.resolved_target || app.executablePath || '—';
    const aliases = (app.aliases || []).join(', ') || '—';
    const reason = available ? '' : (app.message || 'Not found');
    return `
      <tr class="atlas-desktop-apps-row" data-app-status="${status}">
        <td>${_esc(app.display_name || app.name || app.id)}</td>
        <td><span class="atlas-desktop-apps-badge atlas-desktop-apps-badge--${status}">${available ? 'Available' : 'Missing'}</span></td>
        <td class="atlas-desktop-apps-path">${_esc(path)}</td>
        <td class="atlas-desktop-apps-aliases">${_esc(aliases)}</td>
        <td class="atlas-desktop-apps-reason">${_esc(reason)}</td>
      </tr>`;
  }).join('');
}

export async function openDesktopAppsModal() {
  const modal = _el('atlas-desktop-apps-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  const summary = _el('atlas-desktop-apps-summary');
  if (summary) summary.textContent = 'Loading configured apps…';
  try {
    const [status, appsData] = await Promise.all([
      _fetchJson('/api/atlas/desktop/status'),
      _fetchJson('/api/atlas/desktop/apps'),
    ]);
    const count = status.app_count ?? appsData.app_count ?? Object.keys(appsData.apps || {}).length;
    const available = (status.available_apps || appsData.available_apps || []).length;
    const missing = (status.missing_apps || appsData.missing_apps || []).length;
    if (summary) {
      summary.textContent = `${status.label || status.message || 'Bridge status unknown'} · ${available}/${count} apps available${missing ? ` · ${missing} missing` : ''}`;
    }
    _renderAppsTable(appsData);
  } catch (_) {
    if (summary) summary.textContent = 'Could not load apps.';
    _renderAppsTable({});
  }
}

export function closeDesktopAppsModal() {
  const modal = _el('atlas-desktop-apps-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
}

export function initAtlasDesktopApps(deps = {}) {
  _deps = deps;
  _el('atlas-desktop-view-apps')?.addEventListener('click', () => { void openDesktopAppsModal(); });
  _el('atlas-hq-desktop-view-apps')?.addEventListener('click', () => { void openDesktopAppsModal(); });
  const modal = _el('atlas-desktop-apps-modal');
  modal?.querySelectorAll('[data-desktop-apps-close]').forEach((btn) => {
    btn.addEventListener('click', closeDesktopAppsModal);
  });
  document.addEventListener('keydown', (e) => {
    const m = _el('atlas-desktop-apps-modal');
    if (e.key === 'Escape' && m && !m.classList.contains('hidden')) closeDesktopAppsModal();
  });
}

const atlasDesktopApps = {
  openDesktopAppsModal,
  closeDesktopAppsModal,
  initAtlasDesktopApps,
};

export default atlasDesktopApps;
