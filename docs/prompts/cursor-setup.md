# Cursor prompt templates for Atlas OS Community

Copy a template into Cursor Agent chat. Replace bracketed placeholders with your specifics. These prompts are generic — do not paste API keys, personal paths, or private project names.

---

## Improve Atlas UI

```
Improve the Atlas OS Community UI for [screen or component name].

Constraints:
- Do not change app functionality beyond what is needed for the UI fix
- Preserve Atlas visual style: blueprint UI, glassmorphism, neon theme variables from static/themes/atlas-themes.css
- Keep voice-first workflow and bottom dock / global HUD intact
- Reuse existing CSS classes and theme variables; no new hard-coded colors
- No Unicode emoji in UI

Task:
[Describe the layout, spacing, readability, or accessibility issue]

Files likely involved:
[List paths if known, e.g. static/js/home.js, static/style.css]

Deliver:
- Minimal focused diff
- Screenshot description of before/after
```

---

## Add new voice command

```
Add a new voice command to Atlas OS Community.

Command intent:
[What the user says, e.g. "open project settings"]

Expected action:
[What should happen — navigate, call API, trigger desktop bridge, etc.]

Constraints:
- Follow existing patterns in static/js/atlasVoiceActions.js and related voice modules
- Do not break existing voice navigation
- Keep responses brief for voice mode (Atlas identity)
- No personal data or hard-coded private paths

Deliver:
- Implementation in the appropriate voice handler
- Manual test steps (browser mic on localhost)
```

---

## Add new desktop app

```
Add a new app entry to the Atlas Desktop Bridge whitelist.

App details:
- ID: [stable-id]
- Display name: [Human name]
- Voice aliases: [phrases users might say]
- Launch type: folder_exe | url | uri | windows_builtin

Constraints:
- Edit desktop_bridge/apps.json only (and docs if needed)
- Use generic paths (%LOCALAPPDATA%, env overrides) — no C:\Users\... paths
- Set enabled: false by default in the template entry
- Match existing apps.json schema

Deliver:
- JSON entry with fallbacks and env_path_key if applicable
- PowerShell test steps for desktop_bridge.py
```

---

## Add new theme

```
Add a new Atlas OS Community theme to the personalisation system.

Theme name: [kebab-case-id]
Palette direction: [e.g. cyan/teal dark blueprint]

Constraints:
- Follow patterns in static/themes/atlas-themes.css
- Wire through existing theme selection in settings / atlasUserSettings
- Use CSS variables; glassmorphism and neon accents consistent with existing themes
- Do not refactor unrelated UI

Deliver:
- Theme block in atlas-themes.css
- Registration in settings if required
- List of CSS variables changed
```

---

## Create new council agent

```
Add a new Atlas Council agent (report-only by default).

Agent role: [e.g. security reviewer]
Purpose: [What reports it produces]

Constraints:
- Follow config/atlas/council.json and src/atlas_council.py patterns
- Generic prompts — no personal names or private project references
- Agent should remain report-only unless explicitly scoped otherwise
- Add tests if the repo pattern expects them

Deliver:
- Config entry
- Any backend/frontend wiring needed
- Example report shape (placeholder content only)
```

---

## Debug Docker issue

```
Help debug an Atlas OS Community Docker issue on Windows.

Symptom:
[What fails — build error, mount error, port conflict, container exit]

Environment:
- Windows version: [e.g. Windows 11]
- Docker Desktop WSL2: [yes/no]
- APP_PORT: [7000 or other]
- Workspace path: C:\AtlasWorkspace (or your path)

Already tried:
[List steps]

Constraints:
- Documentation and config fixes only unless a clear bug is found
- Do not rename internal Docker service names (odysseus) in this pass
- Reference INSTALL.md troubleshooting section

Deliver:
- Root cause hypothesis
- Commands to run (docker compose logs, config checks)
- Fix or doc update if applicable
```

---

## General rules for all prompts

1. **Scope:** Ask for minimal diffs; no unrelated refactors.
2. **Privacy:** No `.env`, API keys, personal names, or `C:\Users\...` paths in commits.
3. **Style:** Match Atlas OS Community — voice-first, blueprint UI, theme variables.
4. **Tests:** Run `python -m pytest tests -q` for backend changes when relevant.
5. **Docs-only changes:** Update README, INSTALL, or CONTRIBUTING when user-facing behaviour changes.
