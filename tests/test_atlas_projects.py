"""Tests for Atlas project activity and sorting."""

from src.atlas_projects import compute_potential_score, sort_recent_projects


def test_sort_pinned_first():
    projects = [
        {"id": "b", "name": "Beta", "activity_score": 100},
        {"id": "a", "name": "Alpha", "pinned": True, "activity_score": 1},
    ]
    ordered = sort_recent_projects(projects)
    assert ordered[0]["id"] == "a"


def test_potential_score_clamped():
    p = {"indexed": True, "last_indexed_at": "2026-01-01T00:00:00+00:00", "pinned": True, "status": "active"}
    summary = {"important_files": ["README.md", "package.json"], "recent_changes": ["a.ts"]}
    finance = {"monetisation_strategy": "SaaS", "notes": "x"}
    score = compute_potential_score(p, summary, finance)
    assert 0 <= score <= 100
    assert score >= 70
