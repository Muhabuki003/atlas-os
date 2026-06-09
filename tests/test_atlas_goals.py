"""Atlas goals API persistence."""

from src.atlas_goals import load_goals, patch_goal, save_goals


def test_load_goals_defaults_empty(tmp_path, monkeypatch):
    monkeypatch.setattr("src.atlas_goals._goals_path", lambda: tmp_path / "goals.json")
    data = load_goals()
    assert data.get("goals") == []


def test_patch_goal_updates_amounts(tmp_path, monkeypatch):
    monkeypatch.setattr("src.atlas_goals._goals_path", lambda: tmp_path / "goals.json")
    save_goals({
        "goals": [{
            "id": "finance-main",
            "title": "Finance Goal",
            "type": "money",
            "current": 0,
            "target": 10000,
            "currency": "USD",
        }]
    })
    updated = patch_goal("finance-main", {"current": 2500, "target": 10000})
    assert updated is not None
    assert updated["current"] == 2500
    reloaded = load_goals()
    fin = next(g for g in reloaded["goals"] if g["id"] == "finance-main")
    assert fin["current"] == 2500
