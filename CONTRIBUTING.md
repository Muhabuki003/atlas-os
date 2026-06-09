# Contributing to Atlas OS Community

Thanks for helping improve Atlas OS Community. Focused, testable contributions are easiest to review and merge.

> **Upstream:** This project builds on the open-source [Odysseus](https://github.com/pewdiepie-archdaemon/odysseus) workspace (MIT License). Respect upstream licensing and attribution when contributing.

## Branch model

- **`main`** — default branch; PRs target **`main`** until a dedicated `dev` branch is created.
- When a `dev` branch exists, open PRs against **`dev`** instead. The maintainer merges stable work to `main` at releases.

Check the base branch dropdown when opening a PR.

## Before you start

- Search existing [issues](../../issues) and [pull requests](../../pulls) before opening a new one.
- Prefer **one bug fix or feature per PR**.
- Avoid broad rewrites, formatting-only diffs, or unrelated refactors mixed with behaviour changes.
- For large features, open an issue first and describe your approach.

## Setup

Docker is the recommended path:

```powershell
git clone https://github.com/YOUR_ORG/atlas-os-community.git
cd atlas-os-community
copy .env.example .env
mkdir C:\AtlasWorkspace\Projects
docker compose up -d --build
```

Manual development (Python 3.11+):

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn app:app --host 127.0.0.1 --port 7000
```

See [INSTALL.md](INSTALL.md) for full Windows setup.

## Running checks

Run the smallest relevant checks for your change:

```powershell
python -m pytest tests -q
python -m compileall -q app.py routes src tests
node --check static/js/<file-you-changed>.js
```

For Docker-related changes:

```powershell
docker compose config
docker compose up -d --build
docker compose logs --tail=120 odysseus
```

Mention what you ran in the PR description. If you could not run a check, say why.

## Pull requests

Good PRs include:

- A short explanation of the bug or feature
- Files or areas changed
- Manual test steps from running the **actual app**, not only unit tests
- Screenshots or short recordings for UI changes
- A linked issue reference, e.g. `Fixes #123`

Keep PRs **focused**. Large PRs that mix cleanup, formatting, refactors, and behaviour changes are hard to review.

### LLM-generated PRs

If you use an AI coding agent (Cursor, Claude Code, Codex, etc.):

- Open an issue describing the problem **before** submitting a bulk PR
- Describe clearly what the agent changed and why
- Review generated code carefully — do not submit unverified diffs
- Match Atlas visual style (see below); style mismatches may be closed even if the fix is technically correct

## Atlas visual style

Atlas OS Community has an intentional look. PRs that ignore it may be closed without merge.

Before submitting UI changes (CSS, HTML, SVG, or `static/js/` modules that draw to the DOM):

1. **Run the app locally** and verify in a browser.
2. **Attach screenshots** (and mobile if relevant).
3. **Preserve the Atlas visual language:**
   - **Blueprint UI** — structured panels, status bars, mission-control surfaces
   - **Glassmorphism** — translucent cards and overlays using existing patterns
   - **Neon theme variables** — reuse CSS variables from `static/themes/atlas-themes.css`; do not hard-code new palette values
   - **Voice-first workflow** — do not break Home voice navigation or global HUD patterns
   - **Bottom dock / global HUD** — extend existing chrome; do not invent parallel navigation
4. Reuse existing button, input, card, and border classes.
5. **No Unicode emoji in UI or code** — use inline SVG or plain text.
6. **Do not add parallel components** when a similar widget already exists.

If unsure whether a change is visual, treat it as visual and attach a screenshot.

## What not to commit

- `.env`, API keys, tokens, or webhook secrets
- `data/`, `logs/`, databases, uploads, backups, or runtime state
- Personal names, private project names, finance data, calendar entries, or real agent reports
- Personal Windows paths (`C:\Users\...`) except documented generic examples

Use `.env.example` for placeholders only.

## Issue reports

For bugs, include:

- Install method (Docker, manual Python, etc.)
- OS and browser
- Exact steps to reproduce
- Expected vs actual behaviour
- Logs or screenshots (**redact secrets first**)

For model-serving issues, include backend (Ollama, vLLM, OpenAI, etc.), model name, and relevant Cookbook or server logs.

Issues with only "help" or "does not work" and no reproduction steps may be closed as not actionable.

## Security

Do not post secrets, API keys, private logs, or personal documents in issues or PRs.

For vulnerability reports, follow [SECURITY.md](SECURITY.md).
