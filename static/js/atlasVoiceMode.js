// Atlas OS — Voice Mode V1 (browser STT/TTS, user-activated only)

const DEFAULT_WAKE_PHRASES = [
  'atlas are you awake',
  'atlas what\'s up',
  'atlas whats up',
  'hey atlas',
];

const STORAGE_KEY = 'atlas_voice_prefs';

let _deps = {};
let _status = 'idle';
let _recognition = null;
let _listeningMode = false;
let _speakReplies = false;
let _selectedVoice = '';
let _wakePhrases = [...DEFAULT_WAKE_PHRASES];
let _transcript = '';
let _open = false;

function _el(id) {
  return document.getElementById(id);
}

function _loadPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const p = JSON.parse(raw);
    if (typeof p.speakReplies === 'boolean') _speakReplies = p.speakReplies;
    if (p.voice) _selectedVoice = p.voice;
    if (Array.isArray(p.wakePhrases) && p.wakePhrases.length) _wakePhrases = p.wakePhrases;
  } catch (_) {}
}

function _savePrefs() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      speakReplies: _speakReplies,
      voice: _selectedVoice,
      wakePhrases: _wakePhrases,
    }));
  } catch (_) {}
}

function _speechSupported() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

function _setStatus(status) {
  _status = status;
  const pill = _el('atlas-voice-status');
  if (pill) {
    pill.textContent = status.charAt(0).toUpperCase() + status.slice(1);
    pill.dataset.status = status;
  }
}

function _updateTranscript(text) {
  _transcript = text;
  const ta = _el('atlas-voice-transcript');
  if (ta) ta.value = text;
  const homeInput = _el('atlas-home-command-input');
  if (homeInput && _open) homeInput.value = text;
}

function _populateVoices() {
  const sel = _el('atlas-voice-tts-voice');
  if (!sel || !window.speechSynthesis) return;
  const voices = window.speechSynthesis.getVoices();
  sel.innerHTML = '<option value="">System default</option>' + voices.map(v => `
    <option value="${v.name.replace(/"/g, '&quot;')}"${_selectedVoice === v.name ? ' selected' : ''}>${v.name} (${v.lang})</option>
  `).join('');
}

export function speakText(text) {
  if (!text || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  if (_selectedVoice) {
    const voices = window.speechSynthesis.getVoices();
    const match = voices.find(v => v.name === _selectedVoice);
    if (match) utt.voice = match;
  }
  utt.onstart = () => _setStatus('speaking');
  utt.onend = () => _setStatus(_listeningMode ? 'listening' : 'idle');
  utt.onerror = () => _setStatus('idle');
  window.speechSynthesis.speak(utt);
}

function _matchesWakePhrase(text) {
  const low = text.toLowerCase().trim();
  return _wakePhrases.some(p => low.includes(p.toLowerCase().trim()));
}

function _stopRecognition() {
  if (_recognition) {
    try { _recognition.stop(); } catch (_) {}
    _recognition = null;
  }
}

function _startRecognition({ wakeOnly = false } = {}) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    if (_deps.showToast) _deps.showToast('Speech recognition not supported in this browser');
    return;
  }
  _stopRecognition();
  const rec = new SR();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = navigator.language || 'en-GB';
  _recognition = rec;
  _setStatus('listening');

  rec.onresult = (e) => {
    let interim = '';
    let final = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) final += t;
      else interim += t;
    }
    const combined = (_transcript + ' ' + (final || interim)).trim();
    if (wakeOnly && _matchesWakePhrase(combined)) {
      _setStatus('idle');
      const online = _el('atlas-voice-wake-indicator');
      if (online) {
        online.classList.add('atlas-voice-wake-indicator--active');
        online.textContent = 'Atlas online';
      }
      _updateTranscript('');
      if (_deps.showToast) _deps.showToast('Wake phrase detected — Atlas online');
      _listeningMode = false;
      _stopRecognition();
      return;
    }
    if (!wakeOnly) _updateTranscript(combined);
  };

  rec.onerror = () => {
    _setStatus('idle');
    _listeningMode = false;
  };

  rec.onend = () => {
    if (_listeningMode && _open) {
      try { rec.start(); } catch (_) { _setStatus('idle'); }
    } else {
      _setStatus('idle');
    }
  };

  try { rec.start(); } catch (_) {
    _setStatus('idle');
    if (_deps.showToast) _deps.showToast('Could not start microphone');
  }
}

function _submitToAssistant() {
  const text = (_el('atlas-voice-transcript')?.value || '').trim();
  if (!text) return;
  _setStatus('processing');
  if (_deps.openAssistant) {
    _deps.openAssistant(text, { submit: true });
    if (_speakReplies) {
      setTimeout(() => {
        const msgs = document.querySelectorAll('#chat-history .message.assistant .message-content, #chat-history .assistant-msg');
        const last = msgs[msgs.length - 1];
        if (last) speakText(last.textContent?.trim().slice(0, 2000) || '');
        else _setStatus('idle');
      }, 4000);
    } else {
      setTimeout(() => _setStatus('idle'), 800);
    }
  }
  closeVoiceMode();
}

export function openVoiceMode() {
  _open = true;
  const modal = _el('atlas-voice-modal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
  }
  _populateVoices();
  const speakToggle = _el('atlas-voice-speak-replies');
  if (speakToggle) speakToggle.checked = _speakReplies;
  _renderWakePhrases();
  _setStatus('idle');
}

export function closeVoiceMode() {
  _open = false;
  _listeningMode = false;
  _stopRecognition();
  window.speechSynthesis?.cancel();
  const modal = _el('atlas-voice-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
  }
  const online = _el('atlas-voice-wake-indicator');
  if (online) {
    online.classList.remove('atlas-voice-wake-indicator--active');
    online.textContent = '';
  }
  _setStatus('idle');
}

function _renderWakePhrases() {
  const el = _el('atlas-voice-wake-phrases');
  if (!el) return;
  el.innerHTML = _wakePhrases.map(p => `<span class="atlas-voice-wake-chip">${p}</span>`).join('');
}

function _bindEvents() {
  const modal = _el('atlas-voice-modal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target.closest('[data-atlas-voice-close]')) closeVoiceMode();
    });
  }

  _el('atlas-voice-mic-btn')?.addEventListener('click', () => {
    _updateTranscript('');
    _startRecognition({ wakeOnly: false });
  });

  _el('atlas-voice-listen-mode-btn')?.addEventListener('click', () => {
    _listeningMode = true;
    _updateTranscript('');
    _startRecognition({ wakeOnly: true });
    if (_deps.showToast) _deps.showToast('Listening mode — say a wake phrase');
  });

  _el('atlas-voice-stop-btn')?.addEventListener('click', () => {
    _listeningMode = false;
    _stopRecognition();
    window.speechSynthesis?.cancel();
    _setStatus('idle');
  });

  _el('atlas-voice-submit-btn')?.addEventListener('click', _submitToAssistant);

  _el('atlas-voice-speak-replies')?.addEventListener('change', (e) => {
    _speakReplies = e.target.checked;
    _savePrefs();
  });

  _el('atlas-voice-tts-voice')?.addEventListener('change', (e) => {
    _selectedVoice = e.target.value;
    _savePrefs();
  });

  _el('atlas-voice-wake-input')?.addEventListener('change', (e) => {
    const val = (e.target.value || '').split(',').map(s => s.trim()).filter(Boolean);
    if (val.length) {
      _wakePhrases = val;
      _savePrefs();
      _renderWakePhrases();
    }
  });

  if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = _populateVoices;
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && _open) closeVoiceMode();
  });
}

export function initAtlasVoiceMode(deps = {}) {
  _deps = deps;
  _loadPrefs();
  _bindEvents();
}

const atlasVoiceMode = {
  initAtlasVoiceMode,
  openVoiceMode,
  closeVoiceMode,
  speakText,
};

export default atlasVoiceMode;
