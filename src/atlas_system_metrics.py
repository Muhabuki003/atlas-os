"""System metrics for the Atlas System Monitor.

Stdlib-first (no required third-party deps — consistent with platform_compat).
Uses psutil if it happens to be installed, otherwise falls back to reading
/proc on Linux. Returns a dict the frontend (atlasSystemMonitor.js) understands:

    { ok, cpu_percent, ram_used_mb, ram_total_mb, source }

On platforms where nothing is available, returns {"ok": False} so the UI
shows "Not connected" rather than crashing.
"""

from __future__ import annotations

import os
import time
from typing import Any, Dict, Optional

# Cached CPU sample so we can compute a delta without blocking.
_last_cpu: Optional[Dict[str, int]] = None


def _mb(num_bytes: float) -> int:
    return int(num_bytes / (1024 * 1024))


def _psutil_metrics() -> Optional[Dict[str, Any]]:
    try:
        import psutil  # type: ignore
    except Exception:
        return None
    try:
        vm = psutil.virtual_memory()
        # interval=None → non-blocking, compares against previous call.
        cpu = psutil.cpu_percent(interval=None)
        return {
            "ok": True,
            "cpu_percent": round(float(cpu), 1),
            "ram_used_mb": _mb(vm.used),
            "ram_total_mb": _mb(vm.total),
            "source": "psutil",
        }
    except Exception:
        return None


def _read_proc_meminfo() -> Optional[Dict[str, int]]:
    try:
        info: Dict[str, int] = {}
        with open("/proc/meminfo", "r") as fh:
            for line in fh:
                parts = line.split(":")
                if len(parts) != 2:
                    continue
                key = parts[0].strip()
                # Values are in kB.
                val = parts[1].strip().split()[0]
                info[key] = int(val)
        return info
    except Exception:
        return None


def _read_proc_cpu() -> Optional[Dict[str, int]]:
    try:
        with open("/proc/stat", "r") as fh:
            first = fh.readline()
        if not first.startswith("cpu "):
            return None
        fields = [int(x) for x in first.split()[1:]]
        idle = fields[3] + (fields[4] if len(fields) > 4 else 0)
        total = sum(fields)
        return {"idle": idle, "total": total}
    except Exception:
        return None


def _proc_metrics() -> Optional[Dict[str, Any]]:
    global _last_cpu
    mem = _read_proc_meminfo()
    if not mem or "MemTotal" not in mem:
        return None

    total_kb = mem["MemTotal"]
    # MemAvailable is the kernel's best estimate of usable memory.
    avail_kb = mem.get("MemAvailable")
    if avail_kb is None:
        free = mem.get("MemFree", 0)
        buffers = mem.get("Buffers", 0)
        cached = mem.get("Cached", 0)
        avail_kb = free + buffers + cached
    used_kb = max(total_kb - avail_kb, 0)

    cpu_percent: Optional[float] = None
    sample = _read_proc_cpu()
    if sample:
        if _last_cpu:
            d_total = sample["total"] - _last_cpu["total"]
            d_idle = sample["idle"] - _last_cpu["idle"]
            if d_total > 0:
                cpu_percent = round((1.0 - d_idle / d_total) * 100.0, 1)
        _last_cpu = sample

    return {
        "ok": True,
        "cpu_percent": cpu_percent,
        "ram_used_mb": _mb(used_kb * 1024),
        "ram_total_mb": _mb(total_kb * 1024),
        "source": "proc",
    }


def get_system_metrics() -> Dict[str, Any]:
    """Best-effort system CPU/RAM snapshot. Never raises."""
    metrics = _psutil_metrics()
    if metrics is not None:
        return metrics

    metrics = _proc_metrics()
    if metrics is not None:
        return metrics

    return {"ok": False, "error": "metrics unavailable on this platform"}
