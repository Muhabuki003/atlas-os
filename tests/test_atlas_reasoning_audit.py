"""Tests for Atlas Reasoning Audit V1."""

from src.atlas_reasoning_audit import (
    _audit_houseify,
    _detect_feature_groups,
    _scan_hardcoded_in_source,
    run_reasoning_audit,
)


def test_detect_feature_groups_finds_auth_and_schema():
    paths = [
        "src/auth/login.tsx",
        "supabase/migrations/001.sql",
        "src/routes/dashboard.tsx",
    ]
    feats = _detect_feature_groups(paths)
    assert feats["has_auth"]
    assert feats["has_database"]
    assert feats["has_routes"]


def test_audit_houseify_flags_auth_warning():
    projects = [{
        "project_id": "houseify",
        "name": "Houseify",
        "features_detected": {
            "has_auth": True,
            "auth_files": ["src/auth/login.tsx"],
            "has_database": True,
            "database_schema_files": [],
            "has_supabase": True,
            "supabase_base44_files": [],
            "has_routes": True,
            "routes_pages_files": [],
        },
        "auth_summary_warnings": ["Possible outdated/incomplete project summary."],
    }]
    result = _audit_houseify(projects)
    assert result is not None
    assert result["checks"]["auth_files"]
    assert result["warnings"]


def test_run_reasoning_audit_structure():
    data = run_reasoning_audit()
    assert data["ok"] is True
    assert "workspace_health" in data
    assert "active_focus" in data
    assert "projects" in data
    assert "agents" in data
    assert "recommended_fixes" in data
    assert "summary" in data


def test_scan_hardcoded_skips_clean_agent_fallbacks():
    hits = _scan_hardcoded_in_source()
    agent_bias = [h for h in hits if "atlas_agents.py" in h.get("file", "")]
    profile_bias = [
        h for h in hits
        if "aurelius_profile.json" in h.get("file", "") and "current_focus" in h.get("excerpt", "").lower()
    ]
    assert not agent_bias
    assert not profile_bias
