# Installing Atlas OS Community

Beginner-friendly setup guide for **Windows** (primary). Linux and macOS Docker paths work similarly; Desktop Bridge is Windows-only.

## Before you start

You will need:

| # | Program | Why |
|---|---------|-----|
| 1 | [Git](https://git-scm.com/download/win) | Clone the repository |
| 2 | [Docker Desktop](https://www.docker.com/products/docker-desktop/) | Run the Atlas stack |
| 3 | WSL2 / Linux backend | Required by Docker Desktop on Windows when prompted |
| 4 | [Python 3.11+](https://www.python.org/downloads/) | Desktop Bridge (optional) |
| 5 | [Cursor](https://cursor.com/) or [VS Code](https://code.visualstudio.com/) | Edit config and develop (optional) |
| 6 | [Ollama](https://ollama.com/) | Local models (optional) |
| 7 | OpenAI API key | Cloud models (optional — **you must supply your own**) |

---

## Step 1 — Install Docker Desktop

1. Download and install [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/).
2. During setup, **enable the WSL2 backend** if Docker asks.
3. **Restart your PC** if the installer or Docker prompts you to.
4. Open Docker Desktop and wait until it shows **Engine running**.

---

## Step 2 — Clone the repository

Open PowerShell:

```powershell
cd C:\
git clone https://github.com/YOUR_ORG/atlas-os-community.git
cd atlas-os-community
```

---

## Step 3 — Configure environment

```powershell
copy .env.example .env
```

Edit `.env` in Cursor or VS Code:

- Leave `OPENAI_API_KEY` blank until you have your own key
- Confirm `ATLAS_WORKSPACE_HOST=C:\AtlasWorkspace`
- Set `ATLAS_BRIDGE_TOKEN=change-this-token` if you plan to use Desktop Bridge
- Keep `DESKTOP_COMMANDS_ENABLED=false` until the bridge is configured

**Never commit `.env` or paste API keys into issues or screenshots.**

---

## Step 4 — Create workspace folders

```powershell
mkdir C:\AtlasWorkspace
mkdir C:\AtlasWorkspace\Projects
```

Put each project in its own subfolder under `Projects`. Atlas scans this mount from Docker.

---

## Step 5 — Start Atlas

From the repo root:

```powershell
docker compose up -d --build
```

First build may take several minutes.

---

## Step 6 — Open Atlas

In your browser:

```
http://localhost:7000/home
```

On first boot, check logs for the admin account:

```powershell
docker compose logs odysseus
```

Create your account and sign in. Authentication should stay enabled for any network-accessible deployment.

---

## Desktop Bridge (optional, Windows)

The Desktop Bridge lets Atlas launch whitelisted apps on your Windows host (Cursor, browsers, folders, etc.).

### 1. Open a second PowerShell window

```powershell
cd C:\path\to\atlas-os-community
```

### 2. Set the bridge token

Use the same value as `ATLAS_BRIDGE_TOKEN` in `.env`:

```powershell
$env:ATLAS_BRIDGE_TOKEN="change-this-token"
```

### 3. Run the bridge

```powershell
python desktop_bridge\desktop_bridge.py
```

Leave this window open while using desktop commands.

### 4. Configure app paths

Edit `desktop_bridge/apps.json`:

- Set `enabled: true` only for apps you use
- Fix `path` / `exe` entries for your machine (or use `%LOCALAPPDATA%` placeholders)
- See [desktop_bridge/README.md](desktop_bridge/README.md)

### 5. Enable desktop commands in Atlas

In Atlas settings or `data/atlas/desktop_permissions.json` (created on first run):

```json
{
  "desktop_commands_enabled": true,
  "bridge_url": "http://host.docker.internal:8765",
  "bridge_token": "change-this-token"
}
```

Also set `DESKTOP_COMMANDS_ENABLED=true` in `.env` and restart Docker if needed.

---

## Ollama (optional — local models)

1. Install [Ollama](https://ollama.com/) on Windows.
2. Pull a model:

```powershell
ollama pull llama3.2
```

3. Make sure Ollama is running (system tray or `ollama serve`).
4. In `.env`:

```env
OLLAMA_BASE_URL=http://host.docker.internal:11434
```

5. Restart Docker: `docker compose up -d`
6. Add or select models in Atlas **Settings → Models**.

If Ollama listens only on localhost, ensure it is reachable from Docker via `host.docker.internal`.

---

## OpenAI (optional — cloud models)

1. Create an API key at [platform.openai.com](https://platform.openai.com/api-keys).
2. Add it to `.env`:

```env
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-5.5
```

3. Restart Docker: `docker compose up -d`

**You must use your own key.** Atlas OS Community does not ship API keys. Without a key, cloud model features show a configuration warning; the app still runs.

You can also configure providers in Atlas **Settings** after first login.

---

## Troubleshooting

### Docker daemon not running

- Open Docker Desktop and wait for **Engine running**
- Restart Docker Desktop from the tray menu
- Reboot if WSL2 integration fails after install

### WSL2 missing or not enabled

- Install [WSL2](https://learn.microsoft.com/en-us/windows/wsl/install)
- In Docker Desktop → Settings → General, enable **Use the WSL 2 based engine**
- Restart PC

### Port 7000 already in use

Set a different port in `.env`:

```env
APP_PORT=7001
```

Then recreate containers:

```powershell
docker compose down
docker compose up -d --build
```

Open `http://localhost:7001/home` instead.

### Projects not found / workspace empty

- Confirm folders exist under `C:\AtlasWorkspace\Projects`
- Restart Docker Desktop if the bind mount fails
- Run **Workspace Scan** from Atlas Home or Project HQ

### Desktop Bridge not connected

- Is `desktop_bridge.py` running in a PowerShell window?
- Does `ATLAS_BRIDGE_TOKEN` match in `.env`, the bridge process, and `desktop_permissions.json`?
- Is `desktop_commands_enabled` set to `true`?
- Check `C:\AtlasWorkspace\Logs\desktop_bridge.log`

### Cursor (or other app) not opening

- Verify the app path in `desktop_bridge/apps.json`
- Set `enabled: true` for that app entry
- Use env overrides, e.g. `$env:ATLAS_CURSOR_PATH = "%LOCALAPPDATA%\Programs\cursor\Cursor.exe"`

### Voice not working in browser

- Allow microphone permission for `localhost`
- Use HTTPS or localhost (some browsers block mic on insecure origins)
- Check **Settings → Atlas / Voice** for TTS and identity settings
- Optional STT requires `faster-whisper` in the container

### OpenAI key missing or invalid

- Confirm `OPENAI_API_KEY` is set in `.env` (no quotes needed)
- Restart: `docker compose up -d`
- Verify the key is active at platform.openai.com
- Do not paste keys into GitHub issues

### View logs

```powershell
docker compose logs -f odysseus
```

---

## Next steps

- Read [README.md](README.md) for feature overview
- Read [SECURITY.md](SECURITY.md) before exposing Atlas beyond localhost
- Read [CONTRIBUTING.md](CONTRIBUTING.md) if you want to contribute
- Use [docs/prompts/cursor-setup.md](docs/prompts/cursor-setup.md) for Cursor prompt templates
