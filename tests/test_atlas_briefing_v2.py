"""Tests for Atlas Daily Briefing V2."""

from src.atlas_briefing_v2 import generate_briefing_v2, load_briefing_settings


def test_briefing_v2_shape():
    result = generate_briefing_v2()
    assert result["ok"] is True
    assert isinstance(result.get("spoken"), str)
    assert len(result["spoken"]) > 20
    visual = result.get("visual") or {}
    assert "headline" in visual
    assert "priorities" in visual
    assert "recommendation" in visual
    assert "greeting" in visual


def test_briefing_settings_defaults():
    settings = load_briefing_settings()
    assert "speak_on_home_start" in settings
    assert "briefing_style" in settings
    assert settings.get("include_finance") is True
