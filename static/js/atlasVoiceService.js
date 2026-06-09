// Atlas OS V6.1 — Global voice singleton (wake, transcript, desktop, navigation)

import atlasVoiceNavigation from './atlasVoiceNavigation.js';

let _inited = false;
let _desktopBridgeLabel = '—';
let _settings = {};

const atlasVoiceService = {
  async init(deps = {}) {
    if (_inited) return;
    _inited = true;
    await import('./atlasVoiceContext.js');
    await import('./atlasVoiceActionsPanel.js');
    await import('./atlasVoiceUi.js');
    await import('./atlasOverlayTools.js');
    await import('./atlasPersonality.js');
    const userSettings = await import('./atlasUserSettings.js');
    await userSettings.default.loadAtlasUserSettings();
    atlasVoiceNavigation.initAtlasVoiceNavigation(deps);

    const voiceMod = await import('./atlasVoiceMode.js');
    const atlasVoiceMode = voiceMod.default;
    atlasVoiceMode.initAtlasVoiceMode({
      showToast: deps.showToast,
      openAssistant: deps.openAssistant,
    });
    window.atlasVoiceMode = atlasVoiceMode;

    if (deps.submitHomeChat) {
      const homeConvMod = await import('./atlasHomeConversation.js');
      const atlasHomeConversation = homeConvMod.default;
      atlasHomeConversation.initAtlasHomeConversation({
        submitChat: deps.submitHomeChat,
        openFullAssistant: deps.openFullAssistant || (() => deps.openAssistant?.('', { submit: false })),
        showToast: deps.showToast,
        voiceService: atlasVoiceService,
      });
      window.atlasHomeConversation = atlasHomeConversation;
    }

    this.refreshDesktopBridgeStatus();
    requestAnimationFrame(() => this.startGlobalVoice());
    setInterval(() => this.refreshDesktopBridgeStatus(), 30000);
  },

  onRouteChange(route) {
    const r = route || 'home';
    window.AtlasVoiceContext?.set?.({ currentRoute: r });
    this.updateHudMeta();
    window.AtlasVoiceActionsPanel?.refresh?.();
  },

  async refreshDesktopBridgeStatus() {
    try {
      const data = await fetch('/api/atlas/desktop/status', { credentials: 'same-origin' }).then((r) => r.json());
      const ready = data.state === 'ready' || (data.enabled && data.bridge_ready);
      const avail = (data.available_apps || []).length;
      const total = data.app_count;
      _desktopBridgeLabel = ready && total != null
        ? `Desktop Ready ${avail}/${total}`
        : (data.label || data.message || 'Desktop Offline').replace('Desktop Control: ', 'Desktop ');
    } catch (_) {
      _desktopBridgeLabel = 'Desktop Offline';
    }
    this.updateHudMeta();
  },

  patchSettings(settings) {
    _settings = { ..._settings, ...settings };
    this.updateHudMeta();
  },

  updateHudMeta(settings) {
    if (settings) _settings = { ..._settings, ...settings };
    const passive = document.getElementById('atlas-status-passive');
    const conv = document.getElementById('atlas-status-conversation');
    const speak = document.getElementById('atlas-status-speak');
    const bridge = document.getElementById('atlas-status-bridge');
    const paused = window.atlasHomeConversation?.isPaused?.();

    if (passive) {
      const on = !paused && _settings.passive_wake_enabled !== false;
      passive.textContent = `Passive Wake: ${on ? 'ON' : 'OFF'}`;
      passive.dataset.on = on ? 'true' : 'false';
      passive.disabled = false;
    }
    if (conv) {
      const on = !!_settings.conversation_mode_enabled && !paused;
      conv.textContent = `Conversation: ${on ? 'ON' : 'OFF'}`;
      conv.dataset.on = on ? 'true' : 'false';
    }
    if (speak) {
      const on = !!_settings.speak_replies;
      speak.textContent = `Speak: ${on ? 'ON' : 'OFF'}`;
      speak.dataset.on = on ? 'true' : 'false';
    }
    if (bridge) bridge.textContent = _desktopBridgeLabel;
  },

  setListeningLabel(label) {
    const el = document.getElementById('atlas-status-listening');
    if (el) el.textContent = label ? `Listening: ${label.replace(/^Listening:?\s*/i, '')}` : 'Listening: …';
  },

  setLastCommand(cmd) {
    const el = document.getElementById('atlas-status-last');
    if (el) el.textContent = cmd ? `Last: ${cmd}` : 'Last: —';
  },

  triggerWakeAnimation() {
    const bar = document.getElementById('atlas-os-status-bar');
    const core = document.getElementById('atlas-core');
    [bar, core].forEach((el) => {
      if (!el) return;
      el.classList.remove('atlas-voice-wake-pulse');
      void el.offsetWidth;
      el.classList.add('atlas-voice-wake-pulse');
    });
  },

  startGlobalVoice() {
    window.atlasHomeConversation?.onGlobalVoiceStart?.()
      || window.atlasVoiceMode?.startPassiveWakeListening?.();
    this.updateHudMeta(window.atlasHomeConversation?.getVoiceSettings?.() || {});
  },
};

window.atlasVoiceService = atlasVoiceService;
export default atlasVoiceService;
