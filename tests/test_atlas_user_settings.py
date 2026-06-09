"""Atlas user profile + theme settings persistence."""

from src.atlas_user_settings import load_user_settings, patch_user_settings, save_user_settings


def test_load_user_settings_defaults(tmp_path, monkeypatch):
    monkeypatch.setattr("src.atlas_user_settings._path", lambda: tmp_path / "user_settings.json")
    data = load_user_settings()
    assert data["assistant_identity"] == "Atlas"
    assert data["theme"] == "default-blue"
    assert data["preferred_voice"] == "Google UK English Male"


def test_patch_user_settings_atlasia(tmp_path, monkeypatch):
    monkeypatch.setattr("src.atlas_user_settings._path", lambda: tmp_path / "user_settings.json")
    load_user_settings()
    updated = patch_user_settings({"assistant_identity": "Atlasia"})
    assert updated["assistant_identity"] == "Atlasia"
    assert updated["voice_gender"] == "female"
    assert updated["preferred_voice"] == "Google UK English Female"


def test_patch_user_settings_theme(tmp_path, monkeypatch):
    monkeypatch.setattr("src.atlas_user_settings._path", lambda: tmp_path / "user_settings.json")
    load_user_settings()
    updated = patch_user_settings({"theme": "matrix-green", "preferred_address": "boss"})
    assert updated["theme"] == "matrix-green"
    assert updated["preferred_address"] == "boss"
    reloaded = load_user_settings()
    assert reloaded["theme"] == "matrix-green"


def test_patch_speech_rate_clamped(tmp_path, monkeypatch):
    monkeypatch.setattr("src.atlas_user_settings._path", lambda: tmp_path / "user_settings.json")
    load_user_settings()
    updated = patch_user_settings({"speech_rate": 3.5, "response_style": "executive"})
    assert updated["speech_rate"] == 2.0
    assert updated["response_style"] == "executive"
