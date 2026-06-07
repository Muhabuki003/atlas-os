"""Atlas OS agent report workers — LLM-backed report generation, no tool execution."""

from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from src.atlas_config import (
    build_atlas_system_context,
    data_dir,
    load_agents,
    load_aurelius_profile,
    load_projects,
    load_reports,
    save_agents,
    save_reports,
)
from src.atlas_mount_workspace import save_agent_report_markdown
from src.atlas_project_index import (
    format_summaries_for_agents,
    load_all_summaries,
    load_summary,
)

logger = logging.getLogger(__name__)

REPORT_ACTIONS = ["approve", "revise", "archive"]

# action -> (required agent_id, report title template)
ACTION_SPECS: Dict[str, Dict[str, Any]] = {
    "developer_review": {
        "agent_id": "developer",
        "title": "Developer Review Plan",
    },
    "developer_project_review": {
        "agent_id": "developer",
        "title": "Developer Project Review",
    },
    "research_brief": {
        "agent_id": "research",
        "title": "Research Brief",
    },
    "business_ideas": {
        "agent_id": "research",
        "title": "Business Ideas Brief",
    },
    "marketing_ideas": {
        "agent_id": "marketing",
        "title": "Marketing Ideas",
    },
    "business_strategy": {
        "agent_id": "business",
        "title": "Business Strategy Brief",
    },
    "business_analysis": {
        "agent_id": "business",
        "title": "Business Analysis",
    },
    "monetisation_plan": {
        "agent_id": "business",
        "title": "Monetisation Plan",
    },
    "architecture_plan": {
        "agent_id": "architect",
        "title": "Architecture Plan",
    },
    "sync_agents": {
        "agent_id": None,
        "title": "Agent Network Sync",
    },
}

# Legacy aliases from the mock endpoint
_ACTION_ALIASES = {
    "business_ask": "business_strategy",
    "architecture_review": "architecture_plan",
    "sync": "sync_agents",
}

_AGENT_PROMPTS: Dict[str, str] = {
    "developer": """You are the Developer Agent inside Atlas OS.
Produce a **code/project review plan** or **Cursor prompt** for the user.
Do NOT execute code, modify files, or run shell commands.
Output a structured report with:
1. Executive summary (2-3 sentences)
2. Scope and files/areas to inspect
3. Review checklist (bugs, architecture, DX, tests)
4. Suggested Cursor prompt the user can paste to start implementation
5. Risks and quick wins
Be direct, practical, builder-focused.""",
    "architect": """You are the Architect Agent inside Atlas OS.
Produce a **system design / specification** document.
Do NOT execute code or modify infrastructure.
Output a structured report with:
1. Executive summary
2. Problem statement and goals
3. Proposed architecture (components, data flow, boundaries)
4. API/route/data model outline
5. Key decisions and trade-offs
6. Phased implementation plan
Be direct, strategic, slightly futuristic — no generic waffle.""",
    "research": """You are the Research Agent inside Atlas OS.
Based on the user's profile and active projects, generate **5 practical business/app ideas** suitable for Aurelius.
Focus on fast-build SaaS, AI tools, marketplaces, property/logistics/automation, or viral micro-products.
For each idea include: Idea name, Why it fits Aurelius, MVP scope, Monetisation, Difficulty (1-5), First step.
Then add a short competitor/market note for the top 2 ideas.
Be direct and actionable — no generic waffle.""",
    "marketing": """You are the Marketing Agent inside Atlas OS.
Produce **launch angles and content ideas** for the user's priority projects.
Output a structured report with:
1. Executive summary
2. Positioning angles (3 options)
3. Headline / hook ideas (at least 8)
4. Landing page section outline
5. Channel plan for small-audience testing
6. 7-day launch content calendar (bullets)
Be punchy, modern, slightly futuristic.""",
    "business": """You are the Business Agent inside Atlas OS.
Produce **prioritisation, monetisation, and focus recommendations** for Aurelius.
Output a structured report with:
1. Executive summary
2. Current priority stack (what to focus this week)
3. What to pause or defer (and why)
4. Monetisation paths for active projects
5. Fast validation experiments (low cost, 48-72h)
6. Recommended daily focus for the next 3 days
Be direct, strategic, practical — no generic waffle.""",
}


def normalize_action(action: str) -> str:
    action = (action or "").strip().lower()
    return _ACTION_ALIASES.get(action, action)


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _today_utc() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def _summary_from_content(content: str, max_len: int = 220) -> str:
    text = re.sub(r"\s+", " ", (content or "").strip())
    if not text:
        return "Report generated."
    if len(text) <= max_len:
        return text
    cut = text[:max_len].rsplit(" ", 1)[0]
    return (cut or text[:max_len]).rstrip() + "…"


def _strip_thinking(text: str) -> str:
    if not text:
        return ""
    try:
        from src.text_helpers import strip_thinking
        return strip_thinking(text).strip()
    except Exception:
        return text.strip()


def _resolve_llm(owner: Optional[str]) -> Tuple[Optional[str], Optional[str], Optional[Dict]]:
    try:
        from src.endpoint_resolver import resolve_endpoint
        return resolve_endpoint("utility", owner=owner)
    except Exception as exc:
        logger.warning("[atlas-agents] endpoint resolve failed: %s", exc)
        return None, None, None


async def _call_llm(
    owner: Optional[str],
    system: str,
    user_prompt: str,
    *,
    temperature: float = 0.4,
    max_tokens: int = 2500,
) -> Optional[str]:
    url, model, headers = _resolve_llm(owner)
    if not url or not model:
        return None
    try:
        from src.llm_core import llm_call_async
        raw = await llm_call_async(
            url=url,
            model=model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user_prompt},
            ],
            headers=headers,
            temperature=temperature,
            max_tokens=max_tokens,
            timeout=90,
            max_retries=1,
        )
        body = _strip_thinking(raw or "")
        return body if body.strip() else None
    except Exception as exc:
        logger.warning("[atlas-agents] LLM call failed: %s", exc)
        return None


def _project_is_indexed(project_id: Optional[str]) -> bool:
    if not project_id:
        return False
    if load_summary(data_dir(), project_id):
        return True
    proj = next((p for p in load_projects() if p.get("id") == project_id), None)
    return bool(proj and (proj.get("last_indexed_at") or proj.get("indexed")))


def _not_indexed_notice(project_id: Optional[str]) -> str:
    proj = next((p for p in load_projects() if p.get("id") == project_id), None) if project_id else None
    name = (proj or {}).get("name", "This project")
    return (
        f"**Note:** {name} is not indexed yet. Index it first for a better review.\n"
        "Limited metadata is available below until indexing completes."
    )


def _project_context_block(project_id: Optional[str] = None) -> str:
    summaries = load_all_summaries(data_dir())
    if project_id:
        one = load_summary(data_dir(), project_id)
        if one:
            return format_summaries_for_agents([one])
        proj = next((p for p in load_projects() if p.get("id") == project_id), None)
        if proj:
            return (
                f"### {proj.get('name')}\n"
                f"- Path: {proj.get('path')}\n"
                f"- Stack: {', '.join(proj.get('detected_stack') or [])}\n"
                f"- Files: {proj.get('file_count', 0)} (not indexed yet)\n"
            )
    if summaries:
        return format_summaries_for_agents(summaries)
    return "No project summaries indexed yet."


def _build_user_prompt(
    action: str,
    agent_id: str,
    projects: List[Dict[str, Any]],
    *,
    project_id: Optional[str] = None,
) -> str:
    active = [p for p in projects if (p.get("status") or "").lower() == "active"]
    project_lines = "\n".join(
        f"- {p.get('name', 'Project')} ({p.get('priority', '')}): {p.get('description', '')}"
        + (f"\n  Stack: {', '.join(p.get('detected_stack') or [])}" if p.get("detected_stack") else "")
        + (f"\n  Next action: {p.get('suggested_next_action')}" if p.get("suggested_next_action") else "")
        for p in active
    ) or "No active projects configured."
    summary_block = _project_context_block(project_id)

    if action == "business_ideas" and agent_id == "research":
        return (
            "Generate the business/app ideas report now using the Atlas context below.\n\n"
            f"Active projects:\n{project_lines}\n\n"
            "Prioritise ideas that align with Houseify and TransportOS unless broader ideation is clearly better."
        )
    if action == "research_brief" and agent_id == "research":
        return (
            "Compile a research brief covering competitors, APIs, technical approaches, and market patterns "
            "relevant to the active projects below. Be specific and cite categories of sources to check.\n\n"
            f"Active projects:\n{project_lines}"
        )
    if action in ("developer_review", "developer_project_review"):
        target = None
        if project_id:
            target = next((p for p in projects if p.get("id") == project_id), None)
        if not target and active:
            target = active[0]
        name = (target or {}).get("name", "the active project")
        indexed = _project_is_indexed(project_id or (target or {}).get("id"))
        notice = ""
        if project_id and not indexed:
            notice = _not_indexed_notice(project_id) + "\n\n"
        elif action == "developer_project_review" and target and not indexed:
            notice = _not_indexed_notice(target.get("id")) + "\n\n"
        summary_hint = (
            "Use the indexed project summary below for file-level pointers."
            if indexed
            else "Project is not indexed yet. Index it first for a better review."
        )
        return (
            f"Create a developer review plan and Cursor prompt for **{name}**.\n"
            f"{summary_hint}\n"
            "Reference specific files from the project summary when available — do NOT modify files.\n\n"
            f"{notice}"
            f"Project summaries (metadata only):\n{summary_block}\n\n"
            f"Configured projects:\n{project_lines}"
        )
    if action == "architecture_plan":
        primary = active[-1].get("name", "TransportOS") if len(active) > 1 else (active[0].get("name") if active else "TransportOS")
        return (
            f"Create an architecture plan for **{primary}** using detected stack and important files.\n\n"
            f"Project summaries:\n{summary_block}\n\nConfigured projects:\n{project_lines}"
        )
    if action == "marketing_ideas":
        return f"Create marketing launch ideas.\n\nProject summaries:\n{summary_block}\n\nProjects:\n{project_lines}"
    if action == "business_strategy":
        return f"Create business strategy guidance.\n\nProject summaries:\n{summary_block}\n\nProjects:\n{project_lines}"
    if action in ("business_analysis", "monetisation_plan"):
        target = None
        if project_id:
            target = next((p for p in projects if p.get("id") == project_id), None)
        name = (target or {}).get("name", "the selected project")
        return (
            f"Create a business/monetisation analysis for **{name}**.\n"
            "Include revenue models, pricing ideas, and a suggested finance update — "
            "present finance changes as a **suggested update report**, do not assume they are saved.\n\n"
            f"Project summaries:\n{summary_block}\n\nProjects:\n{project_lines}"
        )
    return f"Generate the report.\n\nProject summaries:\n{summary_block}\n\nProjects:\n{project_lines}"


def _fallback_report(
    action: str,
    agent: Dict[str, Any],
    projects: List[Dict[str, Any]],
    *,
    project_id: Optional[str] = None,
) -> str:
    """Useful offline report when no LLM endpoint is configured."""
    profile = load_aurelius_profile()
    focus = profile.get("current_focus", "Houseify and TransportOS")
    name = agent.get("name", "Agent")
    active_names = [p.get("name") for p in projects if p.get("name")]

    if action == "research_brief":
        return f"""# Research Brief (offline fallback)

## Executive summary
Competitor, API, and technical landscape scan for {focus} — offline placeholder.

## Houseify — property platform patterns
- Competitor patterns: onboarding flows, agency dashboards, listing enrichment
- APIs to evaluate: maps, geocoding, media/CDN, CRM hooks
- Technical approaches: structured listing schema, floorplan graph, search indexing

## TransportOS — logistics patterns
- Competitor patterns: dispatch boards, driver apps, exception handling
- APIs to evaluate: routing, telematics, proof-of-delivery, webhooks
- Technical approaches: event-sourced job model, workflow engine, human-in-the-loop AI

## Recommended next research steps
1. Document 5 direct competitors per active project
2. List integration candidates with pricing tiers
3. Re-run with LLM when endpoint is configured"""

    if action == "business_ideas":
        return f"""# Business Ideas Brief (offline fallback)

Atlas could not reach an LLM endpoint — this is a structured placeholder you can re-run when a model is online.

## Executive summary
Five practical ideas aligned with Aurelius's builder profile and focus on {focus}.

## Ideas
1. **AI Property Scout** — Micro-SaaS that scores listings against buyer criteria for Houseify-adjacent users.
   - Why it fits: property + AI + fast MVP
   - MVP: CSV upload + scoring rules + simple web UI
   - Monetisation: £19/mo per agent seat
   - Difficulty: 2/5 | First step: validate with 3 estate agents

2. **Dispatch Copilot** — AI assistant for small logistics teams (TransportOS wedge).
   - Why it fits: logistics automation, operations dashboard
   - MVP: ingest daily routes, flag delays, draft customer updates
   - Monetisation: per-vehicle pricing
   - Difficulty: 3/5 | First step: shadow one operator for a week

3. **Listing-to-3D Pipeline** — Upload floorplan photos → structured room graph for splat/3D later.
   - Why it fits: Houseify roadmap, visual property tech
   - MVP: manual review queue + basic floorplan parser
   - Monetisation: per-listing fee
   - Difficulty: 4/5 | First step: process 10 real listings manually

4. **Viral Micro-Tool: Rent vs Buy Calculator** — SEO + shareable embed for property audience.
   - Why it fits: viral micro-product, monetisable traffic
   - MVP: single-page calculator + email capture
   - Monetisation: affiliate leads / premium reports
   - Difficulty: 1/5 | First step: ship in a weekend

5. **Agent Ops Inbox** — Unified queue where Atlas agents drop reports for approval (meta dogfood).
   - Why it fits: AI OS, automation, internal tooling
   - MVP: reports.json + approval UI (you are here)
   - Monetisation: internal leverage first
   - Difficulty: 2/5 | First step: wire LLM when endpoint available

## Note
Re-run **Start Research Brief** after configuring a default chat model in Settings."""

    if action in ("developer_review", "developer_project_review"):
        target = active_names[0] if active_names else "Houseify"
        if project_id:
            pname = next((p.get("name") for p in projects if p.get("id") == project_id), None)
            if pname:
                target = pname
        ctx = _project_context_block(project_id)
        indexed = _project_is_indexed(project_id)
        index_note = ""
        if project_id and not indexed:
            index_note = (
                "\n\n> **Project is not indexed yet.** Index it first for a better review.\n"
            )
        return f"""# Developer Review Plan (offline fallback)
{index_note}
## Project context (metadata)
{ctx}


## Summary
Structured review plan for **{target}** — generated without LLM. Re-run when a model is online for deeper analysis.

## Scope
- Onboarding and auth flows
- Core domain models and API routes
- Frontend state management and error handling
- Test coverage on critical paths

## Cursor prompt
```
Review the {target} codebase focusing on onboarding, search, and agency features.
List the top 10 risks, missing tests, and refactors that unblock the next sprint.
Propose a 3-step implementation plan with file-level pointers. Do not modify files yet.
```

## Quick wins
1. Add smoke tests for primary user journeys
2. Document API contracts for the next feature slice
3. Identify dead code and inconsistent naming"""

    if action == "architecture_plan":
        target = active_names[-1] if len(active_names) > 1 else (active_names[0] if active_names else "TransportOS")
        return f"""# Architecture Plan (offline fallback)

## Summary
High-level system design outline for **{target}**.

## Components
- **Ingestion API** — events from operators/drivers
- **Workflow Engine** — state machine for jobs/deliveries
- **AI Assist Layer** — suggestions, summaries, anomaly flags (no auto-execution)
- **Dashboard** — ops view + audit log

## Data model (starter)
- Organisation, User, Job, Stop, Vehicle, Event, Report

## Phases
1. Core workflow + manual AI prompts
2. Integrations + reporting
3. Automation suggestions with human approval"""

    if action == "marketing_ideas":
        return f"""# Marketing Ideas (offline fallback)

## Positioning angles
1. **"Property intelligence, not another portal"** — Houseify
2. **"Logistics with a brain"** — TransportOS
3. **"Build fast, ship faster"** — Atlas meta

## Headlines
- Your listings, mapped for the real world
- Ops that think ahead
- From idea to MVP before lunch

## 7-day micro-launch
- Day 1: landing hero + waitlist
- Day 2: 3 LinkedIn posts with demos
- Day 3: outreach to 10 niche users
- Day 4-7: iterate on one channel that responds"""

    if action in ("business_analysis", "monetisation_plan"):
        target = active_names[0] if active_names else "Project"
        if project_id:
            pname = next((p.get("name") for p in projects if p.get("id") == project_id), None)
            if pname:
                target = pname
        return f"""# Business Analysis (offline fallback)

## Project: {target}

## Suggested finance update (not saved automatically)
- Review monetisation strategy in Finance → Project Breakdown
- Consider per-seat SaaS + usage tier for {target}

## Revenue ideas
1. Pilot pricing with one design partner
2. Freemium wedge with paid automation tier
3. Agency/ops seat pricing

Re-run with LLM online for a full monetisation plan."""

    if action == "business_strategy":
        return f"""# Business Strategy Brief (offline fallback)

## This week's focus
1. **Houseify** — onboarding + search + agency loop
2. **TransportOS** — define core workflow and one paying design partner

## Pause unless asked
EcoPlace, EVE Bikes, Fire Scrolls, Core Arena

## Monetisation
- Houseify: agency SaaS + per-listing premium features
- TransportOS: per-seat ops + per-job AI assist tier

## 48h validation
- 5 user interviews per active project
- One paid/manual concierge trial"""

    if action == "sync_agents":
        return f"""# Agent Network Sync

All agents polled at {_now_iso()}.

- Developer: ready for review tasks
- Architect: ready for system design
- Research: idle — run research_brief or business_ideas
- Marketing: check waiting_on fields
- Business: ready for strategy brief

No external actions taken. Reports-only mode active."""

    return f"# {name} Report (offline fallback)\n\nNo LLM endpoint configured. Configure a default chat model in Settings and re-run this action."


def _make_report(
    agent: Dict[str, Any],
    title: str,
    content: str,
    *,
    status: str = "waiting_for_review",
    project_id: Optional[str] = None,
) -> Dict[str, Any]:
    summary = _summary_from_content(content)
    report = {
        "id": str(uuid.uuid4()),
        "agent_id": agent.get("id", ""),
        "agent_name": agent.get("name", "Agent"),
        "title": title,
        "status": status,
        "created_at": _now_iso(),
        "summary": summary,
        "content": content,
        "actions": list(REPORT_ACTIONS),
    }
    if project_id:
        report["project_id"] = project_id
    return report


def _update_agent_after_report(
    agents: List[Dict[str, Any]],
    agent_id: str,
    report: Dict[str, Any],
    *,
    task_label: str,
) -> None:
    for agent in agents:
        if agent.get("id") != agent_id:
            continue
        agent["status"] = "waiting"
        agent["current_task"] = task_label
        agent["last_report"] = report.get("title") or report.get("summary", "")
        agent["waiting_on"] = "User review"
        agent["last_run_at"] = report.get("created_at")
        history = agent.get("report_history")
        if not isinstance(history, list):
            history = []
        history.append(report["id"])
        agent["report_history"] = history[-20:]
        break


async def run_agent_action(
    agent_id: str,
    action: str,
    *,
    owner: Optional[str] = None,
    project_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Generate a report for an agent action. Reports only — no tools or shell."""
    action = normalize_action(action)
    spec = ACTION_SPECS.get(action)
    if not spec:
        return {"ok": False, "message": f"Unknown action: {action}", "queued": False}

    required_agent = spec.get("agent_id")
    if required_agent and required_agent != agent_id:
        return {
            "ok": False,
            "message": f"Action {action} must be run by agent '{required_agent}'",
            "queued": False,
        }

    agents = load_agents()
    if action == "sync_agents":
        content = _fallback_report(action, {"name": "Atlas Core"}, load_projects())
        report = _make_report(
            {"id": "system", "name": "Atlas Core"},
            spec["title"],
            content,
            status="approved",
        )
        reports = load_reports()
        reports.insert(0, report)
        save_reports(reports)
        return {
            "ok": True,
            "queued": False,
            "completed": True,
            "message": "Agent network synced — status summary recorded.",
            "report": report,
            "agents": agents,
        }

    agent = next((a for a in agents if a.get("id") == agent_id), None)
    if not agent:
        return {"ok": False, "message": "Unknown agent", "queued": False}
    if agent.get("can_run") is False:
        return {"ok": False, "message": f"{agent.get('name', 'Agent')} is not runnable", "queued": False}

    projects = load_projects()
    context = build_atlas_system_context()
    system = f"{context}\n\n{_AGENT_PROMPTS.get(agent_id, 'Produce a concise, actionable report.')}"
    user_prompt = _build_user_prompt(action, agent_id, projects, project_id=project_id)

    # Mark working before LLM (persist so UI can show in-flight state)
    for a in agents:
        if a.get("id") == agent_id:
            a["status"] = "working"
            a["current_task"] = f"Generating {spec['title']}…"
            break
    save_agents(agents)

    content = await _call_llm(owner, system, user_prompt)
    used_llm = content is not None
    if not content:
        content = _fallback_report(action, agent, projects, project_id=project_id)

    title = spec["title"]
    if project_id:
        pname = next((p.get("name") for p in projects if p.get("id") == project_id), None)
        if pname:
            title = f"{spec['title']}: {pname}"
    elif active := [p.get("name") for p in projects if (p.get("status") or "").lower() == "active"]:
        if action in ("developer_review", "developer_project_review"):
            title = f"{spec['title']}: {active[0]}"
        elif action == "architecture_plan" and len(active) > 1:
            title = f"{spec['title']}: {active[-1]}"

    report = _make_report(agent, title, content, project_id=project_id)
    reports = load_reports()
    reports.insert(0, report)
    save_reports(reports)

    if project_id:
        try:
            from src.atlas_projects import record_activity
            record_activity(project_id, "agent_report")
        except Exception:
            pass

    md_path = save_agent_report_markdown(
        agent_id,
        action,
        title,
        content,
        created_at=report.get("created_at"),
    )
    if md_path:
        report["workspace_markdown_path"] = md_path
        reports[0] = report
        save_reports(reports)

    agents = load_agents()
    _update_agent_after_report(
        agents,
        agent_id,
        report,
        task_label=f"Awaiting review: {title}",
    )
    save_agents(agents)

    msg = f"{agent.get('name', 'Agent')} completed: {title}"
    if not used_llm:
        msg += " (offline fallback — no LLM endpoint)"

    return {
        "ok": True,
        "queued": False,
        "completed": True,
        "message": msg,
        "report": report,
        "agents": agents,
        "used_llm": used_llm,
    }


def apply_report_action(report_id: str, action: str) -> Dict[str, Any]:
    """Lightweight report lifecycle — approve, revise, or archive."""
    action = (action or "").strip().lower()
    if action not in REPORT_ACTIONS:
        return {"ok": False, "message": f"Unknown report action: {action}"}

    reports = load_reports()
    report = next((r for r in reports if r.get("id") == report_id), None)
    if not report:
        return {"ok": False, "message": "Report not found"}

    agents = load_agents()
    agent_id = report.get("agent_id")

    if action == "approve":
        report["status"] = "approved"
        for agent in agents:
            if agent.get("id") == agent_id:
                agent["status"] = "idle"
                agent["waiting_on"] = None
                agent["current_task"] = None
                agent["last_report"] = report.get("title") or report.get("summary", "")
                break
    elif action == "archive":
        report["status"] = "archived"
        for agent in agents:
            if agent.get("id") == agent_id:
                if agent.get("waiting_on") == "User review":
                    agent["waiting_on"] = None
                    agent["status"] = "ready"
                    agent["current_task"] = None
                break
    elif action == "revise":
        report["status"] = "revision_requested"
        for agent in agents:
            if agent.get("id") == agent_id:
                agent["status"] = "ready"
                agent["waiting_on"] = None
                agent["current_task"] = f"Revise: {report.get('title', 'report')}"
                break

    save_reports(reports)
    save_agents(agents)

    return {
        "ok": True,
        "message": f"Report {action}d",
        "report": report,
        "agents": agents,
    }


def reports_for_queue() -> Dict[str, List[Dict[str, Any]]]:
    """Bucket reports for the Agents Office queue UI."""
    reports = load_reports()
    today = _today_utc()
    pending = [r for r in reports if r.get("status") in ("pending", "generating", "revision_requested")]
    approval = [r for r in reports if r.get("status") == "waiting_for_review"]
    completed = [
        r for r in reports
        if r.get("status") == "approved"
        and (r.get("created_at") or "").startswith(today)
    ]
    return {
        "pending": pending,
        "waiting_for_approval": approval,
        "completed_today": completed,
        "all": reports,
    }
