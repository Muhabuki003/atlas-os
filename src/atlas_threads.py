"""Persistent conversation threads for Atlas + its agents.

Gives every agent (and the Atlas assistant itself) a durable chat history so
they stop "having no context." One JSON file per thread under
``data_dir()/threads``. Threads are keyed by a stable id — typically the agent
id, or ``atlas`` for the main assistant.

This is deliberately small and dependency-free (stdlib JSON) so it works the
same in Docker, local, and cloud deployments.
"""

from __future__ import annotations

import json
import logging
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# Cap stored turns so threads can't grow unbounded on disk / in prompts.
MAX_TURNS = 200
# How many recent turns to feed back into the model as conversation memory.
DEFAULT_CONTEXT_TURNS = 24

_lock = threading.RLock()


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _threads_dir() -> Path:
    from src.atlas_config import data_dir
    d = data_dir() / "threads"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _safe_id(thread_id: str) -> str:
    tid = "".join(c for c in str(thread_id or "").strip().lower() if c.isalnum() or c in "-_")
    return tid or "default"


def _path(thread_id: str) -> Path:
    return _threads_dir() / f"{_safe_id(thread_id)}.json"


def load_thread(thread_id: str) -> Dict[str, Any]:
    """Return the full thread record: {id, messages: [...], updatedAt}."""
    p = _path(thread_id)
    if not p.exists():
        return {"id": _safe_id(thread_id), "messages": [], "updatedAt": None}
    try:
        with _lock:
            data = json.loads(p.read_text("utf-8"))
        if not isinstance(data, dict):
            raise ValueError("bad thread file")
        data.setdefault("id", _safe_id(thread_id))
        data.setdefault("messages", [])
        return data
    except Exception as exc:
        logger.warning("[atlas-threads] load failed for %s: %s", thread_id, exc)
        return {"id": _safe_id(thread_id), "messages": [], "updatedAt": None}


def get_messages(thread_id: str) -> List[Dict[str, Any]]:
    return load_thread(thread_id).get("messages", [])


def append_message(thread_id: str, role: str, content: str, **extra: Any) -> Dict[str, Any]:
    """Append one turn and persist. Returns the stored message."""
    role = role if role in ("user", "assistant", "system") else "user"
    msg: Dict[str, Any] = {
        "role": role,
        "content": str(content or ""),
        "at": _now_iso(),
    }
    if extra:
        msg.update(extra)
    with _lock:
        thread = load_thread(thread_id)
        msgs = thread.get("messages", [])
        msgs.append(msg)
        # Trim oldest turns beyond the cap.
        if len(msgs) > MAX_TURNS:
            msgs = msgs[-MAX_TURNS:]
        thread["messages"] = msgs
        thread["updatedAt"] = msg["at"]
        try:
            _path(thread_id).write_text(json.dumps(thread, indent=2), "utf-8")
        except Exception as exc:
            logger.warning("[atlas-threads] save failed for %s: %s", thread_id, exc)
    return msg


def recent_turns(thread_id: str, limit: int = DEFAULT_CONTEXT_TURNS) -> List[Dict[str, str]]:
    """Recent user/assistant turns as plain {role, content} for the LLM."""
    msgs = get_messages(thread_id)
    turns = [
        {"role": m.get("role", "user"), "content": m.get("content", "")}
        for m in msgs
        if m.get("role") in ("user", "assistant") and m.get("content")
    ]
    return turns[-limit:] if limit and limit > 0 else turns


def clear_thread(thread_id: str) -> None:
    with _lock:
        p = _path(thread_id)
        try:
            if p.exists():
                p.unlink()
        except Exception as exc:
            logger.warning("[atlas-threads] clear failed for %s: %s", thread_id, exc)


def list_threads() -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for p in _threads_dir().glob("*.json"):
        try:
            data = json.loads(p.read_text("utf-8"))
            out.append({
                "id": data.get("id", p.stem),
                "count": len(data.get("messages", [])),
                "updatedAt": data.get("updatedAt"),
            })
        except Exception:
            continue
    out.sort(key=lambda t: t.get("updatedAt") or "", reverse=True)
    return out
