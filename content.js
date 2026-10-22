(() => {
  if (window.__videoSeekBarExtensionLoaded) return;
  window.__videoSeekBarExtensionLoaded = true;

  const DEFAULTS = {
    z: { action: 'rewind', value: 5 },
    x: { action: 'advance', value: 5 },
    c: { action: 'rewind', value: 30 },
    v: { action: 'advance', value: 30 },
    f: { action: 'reset', value: 1 },
    g: { action: 'speedToggle', value: 2.5 },
    h: { action: 'speedToggle', value: 10 },
    a: { action: 'decrease', value: 0.25 },
    s: { action: 'increase', value: 0.25 },
    Space: { action: 'toggle', value: 0 },
    m: { action: 'mute', value: 0 },
    arrowup: { action: 'volumeUp', value: 0.1 },
    arrowdown: { action: 'volumeDown', value: 0.1 }
  };
  let bindings = DEFAULTS;
  let preferredVolume = 1;
  const views = new Map();
  const normalizeBindings = source => {
    const normalized = Object.fromEntries(Object.entries(source || {}).map(([key, item]) => {
      if (item.action === 'seek') return [key, { action: Number(item.value) < 0 ? 'rewind' : 'advance', value: Math.abs(Number(item.value)) }];
      if (item.action === 'speed') return [key, { action: Number(item.value) === 1 ? 'reset' : 'preferred', value: Number(item.value) }];
      return [key, item];
    }));
    const oldToggleDefaults = normalized.f?.action === 'speedToggle' && Number(normalized.f.value) === 2.5 &&
      normalized.g?.action === 'preferred' && Number(normalized.g.value) === 2.5 &&
      normalized.h?.action === 'speedToggle' && Number(normalized.h.value) === 10;
    const originalDefaults = normalized.f?.action === 'reset' && Number(normalized.f.value) === 1 &&
      normalized.g?.action === 'preferred' && Number(normalized.g.value) === 2.5 &&
      normalized.h?.action === 'preferred' && Number(normalized.h.value) === 10;
    if (oldToggleDefaults || originalDefaults) {
      normalized.f = DEFAULTS.f; normalized.g = DEFAULTS.g; normalized.h = DEFAULTS.h;
    }
    return normalized;
  };

  const style = document.createElement('style');
  style.textContent = `video::-webkit-media-controls{display:none!important}video::-webkit-media-controls-enclosure{display:none!important}`;
  (document.head || document.documentElement).append(style);

  const visible = video => {
    const r = video.getBoundingClientRect();
    const s = getComputedStyle(video);
    return r.width > 80 && r.height > 60 && r.bottom > 0 && r.right > 0 &&
      r.top < innerHeight && r.left < innerWidth && s.display !== 'none' &&
      s.visibility !== 'hidden' && Number(s.opacity) > 0;
  };

  function currentVideo() {
    return [...document.querySelectorAll('video')]
      .filter(visible)
      .sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height -
        a.getBoundingClientRect().width * a.getBoundingClientRect().height)[0] || null;
  }

  function attach(video) {
    if (views.has(video)) return views.get(video);
    video.controls = false;
    video.volume = preferredVolume;
    video.muted = preferredVolume === 0;
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;overflow:visible;';
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        :host{display:block}
        .bar{display:flex;align-items:center;gap:8px;width:100%;height:16px;background:#090a0bcc;padding:0 5px 0 0}
        input{display:block;box-sizing:border-box;flex:1;min-width:0;height:8px;margin:0;padding:0;appearance:none;-webkit-appearance:none;background:transparent;cursor:pointer;pointer-events:auto;outline:none}
        .speed{flex:none;color:#fff;font:600 11px/1 system-ui,sans-serif;text-shadow:0 1px 3px #000;white-space:nowrap;min-width:34px;text-align:right}
        input::-webkit-slider-runnable-track{height:4px;background:linear-gradient(to right,#c4f26a 0 var(--played),#ffffff70 var(--played) 100%);border-radius:0}
        input::-moz-range-track{height:4px;background:#ffffff70;border-radius:0}
        input::-moz-range-progress{height:4px;background:#c4f26a;border-radius:0}
        input::-webkit-slider-thumb{-webkit-appearance:none;width:8px;height:8px;margin-top:-2px;border:0;border-radius:50%;background:#c4f26a}
        input::-moz-range-thumb{width:8px;height:8px;border:0;border-radius:50%;background:#c4f26a}
        input:focus-visible{filter:drop-shadow(0 0 4px #c4f26a)}
      </style><div class="bar"><input type="range" min="0" max="1000" value="0" aria-label="Video seek bar" title="Drag to seek"><span class="speed">1.0x</span></div>`;
    (document.documentElement || document.body).append(host);
    const range = shadow.querySelector('input');
    const speed = shadow.querySelector('.speed');
    let dragging = false;
    const update = () => {
      const duration = video.duration;
      const progress = Number.isFinite(duration) && duration > 0 ? video.currentTime / duration : 0;
      range.value = String(Math.round(progress * 1000));
      range.style.setProperty('--played', `${progress * 100}%`);
    };
    range.addEventListener('pointerdown', () => { dragging = true; });
    range.addEventListener('pointerup', () => { dragging = false; });
    range.addEventListener('input', () => {
      const duration = video.duration;
      if (Number.isFinite(duration) && duration > 0) {
        video.currentTime = duration * Number(range.value) / 1000;
        range.style.setProperty('--played', `${Number(range.value) / 10}%`);
      }
    });
    video.addEventListener('timeupdate', () => { if (!dragging) update(); });
    video.addEventListener('durationchange', update);
    video.addEventListener('loadedmetadata', update);
    video.addEventListener('play', update);
    video.addEventListener('pause', update);
    const updateSpeed = () => { speed.textContent = `${Number(video.playbackRate || 1).toFixed(2)}x`; };
    video.addEventListener('ratechange', updateSpeed);
    video.addEventListener('volumechange', () => {
      window.parent.postMessage({ type: 'sbqp-volume-state', volume: video.volume, muted: video.muted }, '*');
    });
    updateSpeed();
    const view = { host, range, update, updateSpeed };
    views.set(video, view);
    return view;
  }

  function place() {
    for (const [video, view] of views) {
      if (!video.isConnected) { view.host.remove(); views.delete(video); continue; }
      video.controls = false;
      if (!visible(video)) { view.host.style.display = 'none'; continue; }
      const r = video.getBoundingClientRect();
      view.host.style.display = 'block';
      view.host.style.left = `${Math.max(0, r.left)}px`;
      view.host.style.top = `${Math.min(innerHeight - 4, r.bottom - 8)}px`;
      view.host.style.width = `${Math.max(0, Math.min(r.width / 2 + 50, innerWidth - r.left))}px`;
      view.update();
      view.updateSpeed();
    }
    for (const video of document.querySelectorAll('video')) if (!views.has(video)) attach(video);
  }

  function onKey(event) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const target = event.target;
    if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
    const binding = event.code === 'Space' ? bindings.Space : bindings[event.key.toLowerCase()];
    if (!binding) return;
    const video = currentVideo();
    if (!video) return;
    if (binding.action === 'rewind' || binding.action === 'advance') {
      const duration = video.duration;
      const delta = Number(binding.value) * (binding.action === 'rewind' ? -1 : 1);
      video.currentTime = Math.max(0, Math.min(Number.isFinite(duration) ? duration : Infinity,
        video.currentTime + delta));
    } else if (binding.action === 'decrease') {
      video.playbackRate = Math.max(0.1, video.playbackRate - Number(binding.value));
    } else if (binding.action === 'increase') {
      video.playbackRate = Math.min(16, video.playbackRate + Number(binding.value));
    } else if (binding.action === 'reset' || binding.action === 'preferred') {
      video.playbackRate = Number(binding.value);
    } else if (binding.action === 'speedToggle') {
      const targetSpeed = Number(binding.value);
      video.playbackRate = Math.abs(video.playbackRate - targetSpeed) < 0.01 ? 1 : targetSpeed;
    } else if (binding.action === 'toggle') {
      if (video.paused || video.ended) video.play().catch(() => {});
      else video.pause();
    } else if (binding.action === 'mute') {
      video.muted = !video.muted;
    } else if (binding.action === 'volumeUp') {
      video.volume = Math.min(1, video.volume + Number(binding.value || 0.1));
      video.muted = false;
    } else if (binding.action === 'volumeDown') {
      video.volume = Math.max(0, video.volume - Number(binding.value || 0.1));
      if (video.volume === 0) video.muted = true;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  addEventListener('message', event => {
    const message = event.data;
    if (message?.type === 'sbqp-volume-state' && event.source !== window.parent) {
      window.parent.postMessage(message, '*');
      return;
    }
    if (event.source !== window.parent || !['sbqp-play', 'sbqp-toggle', 'sbqp-volume', 'sbqp-mute-toggle'].includes(message?.type)) return;
    if (message.type === 'sbqp-volume') {
      const volume = Math.max(0, Math.min(1, Number(message.value) || 0));
      preferredVolume = volume;
      for (const video of document.querySelectorAll('video')) {
        video.volume = volume;
        video.muted = volume === 0;
      }
    } else if (message.type === 'sbqp-mute-toggle') {
      const video = currentVideo();
      if (video) video.muted = !video.muted;
    } else {
      const video = currentVideo();
      if (video && message.type === 'sbqp-play') {
        if (video.paused || video.ended) video.play().catch(() => {});
      } else if (video) {
        if (video.paused || video.ended) video.play().catch(() => {});
        else video.pause();
      }
    }
    for (let i = 0; i < window.frames.length; i++) {
      window.frames[i].postMessage(message, '*');
    }
  });

  document.addEventListener('keydown', onKey, true);
  new MutationObserver(place).observe(document.documentElement, { childList: true, subtree: true });
  addEventListener('resize', place, { passive: true });
  addEventListener('scroll', place, { passive: true, capture: true });
  setInterval(place, 500);

  chrome.storage.sync.get({ keyBindings: DEFAULTS }, result => {
    if (result.keyBindings && typeof result.keyBindings === 'object') bindings = { ...DEFAULTS, ...normalizeBindings(result.keyBindings) };
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.keyBindings) bindings = { ...DEFAULTS, ...normalizeBindings(changes.keyBindings.newValue) };
  });
})();
