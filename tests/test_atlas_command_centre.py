"""Tests for Project Command Centre payload shape."""

from src.atlas_command_centre import build_command_centre


def test_command_centre_returns_expected_shape():
    result = build_command_centre("__nonexistent_project__")
    assert result["ok"] is False

    from src.atlas_config import load_projects
    projects = load_projects()
    if not projects:
        return
    pid = projects[0].get("id")
    if not pid:
        return
    data = build_command_centre(pid)
    assert data["ok"] is True
    assert "project" in data
    assert "score" in data
    assert "stage" in data
    assert "recent_changes" in data
    assert "pipeline" in data
    assert "latest_reports" in data
    assert "recommendation" in data
    assert "desktop" in data
    assert "overall" in data["score"]
    assert "can_open_folder" in data["desktop"]
    assert "can_open_cursor" in data["desktop"]
    assert "reason" in data["desktop"]
