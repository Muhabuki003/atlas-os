# Atlas OS Community

```
───────────────────────────────────────────────
  Atlas OS — voice-first local AI operating layer
───────────────────────────────────────────────
```

Atlas OS Community is a self-hosted AI operating layer for builders who want a local control surface for projects, agents, voice commands, and optional desktop automation. Run it on your own machine with Docker; keep your workspace, keys, and data under your control.

> **Attribution:** Atlas OS Community builds on the open-source [Odysseus](https://github.com/pewdiepie-archdaemon/odysseus) self-hosted AI workspace (MIT License). See [LICENSE](LICENSE) and [ACKNOWLEDGMENTS.md](ACKNOWLEDGMENTS.md) for upstream credits.

## What is Atlas OS?

Atlas OS is a **voice-first AI operating layer** — a local dashboard that combines chat, agents, project awareness, and optional Windows desktop control into one self-hosted experience.

Core ideas:

- **Local-first** — Docker on your machine; workspace mounted from `C:\AtlasWorkspace`
- **Voice-first** — speak to Atlas from Home; navigate apps and actions hands-free
- **Project-aware** — scan mounted folders, index projects, and surface context in Project HQ
- **Agent council** — research, business, architect, developer, and marketing agents (report-only by default)
- **Extensible workspace** — notes, tasks, calendar, documents, Cookbook model serving, memory, RAG, and more from the upstream base

## Highlights

| Area | What you get |
|------|----------------|
| **Atlas Home** | Briefing, goals, projects, council agents, voice navigation |
| **Atlas Council** | Configurable agents that produce structured reports |
| **Project HQ** | Discover and manage projects from your mounted workspace |
| **Desktop Bridge** | Optional Windows host service for whitelisted app launches |
| **Voice commands** | Local speech recognition and TTS hooks (Settings → Atlas / Voice) |
| **Themes** | Blueprint UI with glassmorphism and neon theme variables — **Atlas Blue** (default), Matrix Green, Purple, Red Gold, Pink |
| **Assistant identity** | **Atlas** (default) or **Atlasia** — configurable tone and voice |

## Quick start

**Full install guide:** [INSTALL.md](INSTALL.md)

```powershell
git clone https://github.com/YOUR_ORG/atlas-os-community.git
cd atlas-os-community
copy .env.example .env
mkdir C:\AtlasWorkspace\Projects
docker compose up -d --build
```

Open **http://localhost:7000/home**

On first boot, create or use the admin account shown in `docker compose logs odysseus` (Docker service name from upstream).

## Requirements

- **Windows 10/11** (primary target for workspace mount + Desktop Bridge)
- **Docker Desktop** with WSL2 backend
- **Python 3.11+** (Desktop Bridge and native dev)
- **8 GB+ RAM** recommended for the Docker stack
- Optional: **Ollama** on the host for local models
- Optional: **OpenAI API key** for cloud models (you supply your own key)

## Docker

The default `docker-compose.yml` starts the web UI on port **7000** (loopback-bound by default), plus ChromaDB, SearXNG, and ntfy.

Windows workspace bind:

```
C:\AtlasWorkspace  →  /workspace
```

Key environment variables (see `.env.example`):

| Variable | Purpose |
|----------|---------|
| `ATLAS_WORKSPACE_HOST` | Host workspace path hint |
| `APP_BIND` | Web UI bind address (`127.0.0.1` recommended) |
| `APP_PORT` | Web UI port (default `7000`) |
| `OPENAI_API_KEY` | Optional cloud models |
| `OLLAMA_BASE_URL` | Optional local models via host Ollama |
| `ATLAS_BRIDGE_TOKEN` | Optional Desktop Bridge auth |

## Desktop Bridge

A small Python service on Windows executes **whitelisted** commands from Atlas (open Cursor, browsers, project folders, etc.).

See [desktop_bridge/README.md](desktop_bridge/README.md) and [INSTALL.md](INSTALL.md#desktop-bridge).

## Voice

- Allow microphone access in your browser for voice on Home
- Configure TTS voice, speech rate, and assistant identity in **Settings → Atlas**
- Optional local STT: install `faster-whisper` in the container (see Docker optional requirements)

## Security

Atlas OS can run privileged local capabilities (shell tools, desktop bridge, email, file access). **Do not expose it as a public unauthenticated service.**

- Keep `APP_BIND=127.0.0.1` unless behind a trusted reverse proxy with auth
- Keep Desktop Bridge token secret; bind the bridge to localhost only
- Never commit `.env`, API keys, or runtime `data/` to git

Read [SECURITY.md](SECURITY.md) before any LAN or internet exposure.

## Publishing your fork

If you publish a public copy, sanitize config defaults and run [CLEAN_RELEASE_CHECKLIST.md](CLEAN_RELEASE_CHECKLIST.md).

Runtime files under `data/atlas/` are gitignored and seeded from `config/atlas/` on first boot. Use generic `config/atlas/default_profile.json` — not personal profile data.

## Development

```powershell
python -m pytest tests -q
```

**Contributing:** [CONTRIBUTING.md](CONTRIBUTING.md)

## Credits

- **Odysseus** — upstream self-hosted AI workspace ([MIT License](LICENSE))
- **OpenCode**, **llmfit**, **DeepResearch**, and other projects in [ACKNOWLEDGMENTS.md](ACKNOWLEDGMENTS.md)
- **Atlas OS Community** — Home dashboard, workspace mount, council agents, voice layer, desktop bridge, themes, and personalisation

## License

MIT License — see [LICENSE](LICENSE). Preserve upstream attribution when required.
