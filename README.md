# Atlas OS — BookiStudios

Custom Atlas OS deployment for BookiStudios. Runs on Docker behind Cloudflare + nginx.

## Quick Start

```bash
# Clone (first time)
git clone https://github.com/Muhabuki003/atlas-os.git /root/atlas-os

# Deploy updates
cd /root/atlas-os && ./deploy.sh
```

## What's Connected

| System | Status |
|--------|--------|
| Canvas (UHD) | 16 assignments in UHD Classes calendar. Syncs 6am/6pm |
| Polymarket | Wallet, API keys, trader pipeline in memory |
| BookiStudio AI | Project context in Atlas memory |
| LoveFlix | Project context in Atlas memory |
| BUKIMIND Office | Project context in Atlas memory |

## Editing Yourself

1. **Clone** `https://github.com/Muhabuki003/atlas-os`
2. **Edit** config files in `config/atlas/` or code in `src/`
3. **Commit & push**
4. **SSH into VPS** → `cd /root/atlas-os && ./deploy.sh`

## Architecture

```
Internet → Cloudflare (proxied DNS) → VPS port 80 → nginx (auth) → Docker :7000 → Atlas
```

## Calendars

- `UHD Classes` — Canvas assignments (auto-synced)
- `Polymarket` — Market dates
- `Travel & Trips` — Personal travel
- `Personal` — General events

## Cron Jobs

- `atlas-cal-sync.py` — Syncs Canvas → UHD calendar (6am/6pm, runs via Hermes)
