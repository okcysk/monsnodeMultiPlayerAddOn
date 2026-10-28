const SEARCH_URL = 'https://monsnode.com/';
const AUTO_MODE = new URLSearchParams(location.search).get('auto') === '1';
document.body.classList.toggle('auto-mode', AUTO_MODE);
const grid = document.querySelector('#grid');
const empty = document.querySelector('#empty');
const slots = [];
let autoPlaylist = [];
let nextPlaylistIndex = 4;
let autoSourceUrl = '';
let nextPageNumber = 0;
let nextPageFetch = null;
let playlistExhausted = false;
const mediaUrlCache = new Map();
let activeSlot = 0;
const countSelect = document.querySelector('#player-count');
const toggleAllButton = document.querySelector('#toggle-all');
let playerCount = 4;
let availableSelectedCount = 0;

function updateCountOptions() {
  for (const option of countSelect.options) option.disabled = false;
}

function setPlayerCount(count) {
  playerCount = [1, 2, 4, 9, 16].includes(Number(count)) ? Number(count) : 4;
  countSelect.value = String(playerCount);
  // Two videos sit side by side in one row; every other layout is a square grid.
  const columns = playerCount === 2 ? 2 : Math.sqrt(playerCount);
  grid.style.setProperty('--player-columns', String(columns));
  grid.style.setProperty('--player-rows', String(playerCount === 2 ? 1 : columns));
  grid.setAttribute('aria-label', `${playerCount} video players`);
  while (slots.length < playerCount) slots.push(createSlot(slots.length));
  slots.forEach((slot, index) => {
    slot.cell.hidden = index >= playerCount;
    if (index >= playerCount) slot.video.pause();
  });
  updateToggleAllButton();
  if (!AUTO_MODE) {
    if (slots.slice(0, playerCount).some((slot, i) => !slot.item && selectedItems[i])) applySelection(selectedItems);
  }
}
let selectedItems = [];

const DEFAULTS = {
  z: { action: 'rewind', value: 5 }, x: { action: 'advance', value: 5 },
  c: { action: 'rewind', value: 30 }, v: { action: 'advance', value: 30 },
  f: { action: 'reset', value: 1 }, g: { action: 'speedToggle', value: 2.5 },
  h: { action: 'speedToggle', value: 10 }, a: { action: 'decrease', value: 0.25 },
  s: { action: 'increase', value: 0.25 }, Space: { action: 'toggle', value: 0 },
  'Shift+Space': { action: 'toggleAll', value: 0 },
  m: { action: 'mute', value: 0 }, 'Shift+m': { action: 'muteAll', value: 0 }, arrowup: { action: 'volumeUp', value: 0.1 },
  arrowdown: { action: 'volumeDown', value: 0.1 }
};
let bindings = { ...DEFAULTS };
function normalizeBindings(source) {
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
}

function createSlot(index) {
  const cell = document.createElement('section'); cell.className = 'cell';
  const video = document.createElement('video'); video.preload = 'metadata'; video.playsInline = true; video.controls = false;
  const label = document.createElement('div'); label.className = 'cell-label';
  const number = document.createElement('span'); number.className = 'cell-number'; number.textContent = String(index + 1);
  const title = document.createElement('span'); title.className = 'cell-title';
  const link = document.createElement('a'); link.className = 'cell-link'; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = 'Open post ↗';
  label.append(number, title, link); cell.append(video, label); grid.append(cell);

  const controls = document.createElement('div'); controls.className = 'cell-controls';
  const play = document.createElement('button'); play.type = 'button'; play.textContent = 'Play'; play.title = 'Start playback';
  play.addEventListener('click', () => { activeSlot = index; video.play().catch(() => {}); });
  const reload = document.createElement('button'); reload.type = 'button'; reload.textContent = 'Reload'; reload.title = 'Reload this video';
  reload.addEventListener('click', () => {
    activeSlot = index;
    if (!slot.item) return;
    video.pause(); video.currentTime = 0; video.load(); video.play().catch(() => {});
  });
  const back = document.createElement('button'); back.type = 'button'; back.textContent = 'Back'; back.title = 'Play the previous video in this panel'; back.hidden = !AUTO_MODE;
  back.addEventListener('click', () => { activeSlot = index; goBack(slot); });
  const next = document.createElement('button'); next.type = 'button'; next.textContent = 'Next'; next.title = 'Play the next video'; next.hidden = !AUTO_MODE;
  next.addEventListener('click', () => { activeSlot = index; playNext(slot); });
  const speed = document.createElement('span'); speed.className = 'cell-speed';
  speed.textContent = `${Number(video.playbackRate || 1).toFixed(2)}x`;
  speed.setAttribute('aria-label', `Playback speed for video ${index + 1}`);
  video.addEventListener('ratechange', () => { speed.textContent = `${Number(video.playbackRate || 1).toFixed(2)}x`; });
  for (const eventName of ['play', 'pause', 'ended']) video.addEventListener(eventName, updateToggleAllButton);
  video.addEventListener('ended', () => { if (AUTO_MODE) playNext(slot); });
  cell.addEventListener('pointerdown', () => { activeSlot = index; });
  controls.append(play, reload, back, next, speed); cell.append(controls);
  const slot = { cell, video, title, link, speed, back, next, item: null, selected: false, history: [], playlist: [], playlistIndex: -1, loadToken: 0, order: index };
  return slot;
}

function visibleSlots() { return slots.slice(0, playerCount).filter(slot => slot.item); }

function updateToggleAllButton() {
  if (!toggleAllButton) return;
  const isPlaying = visibleSlots().some(slot => !slot.video.paused && !slot.video.ended);
  toggleAllButton.textContent = isPlaying ? 'Pause all' : 'Play all';
  toggleAllButton.setAttribute('aria-label', `${isPlaying ? 'Pause' : 'Play'} all videos`);
}

toggleAllButton.addEventListener('click', () => {
  const players = visibleSlots();
  const pauseAll = players.some(slot => !slot.video.paused && !slot.video.ended);
  for (const slot of players) {
    if (pauseAll) slot.video.pause();
    else slot.video.play().catch(() => {});
  }
  updateToggleAllButton();
});

function showEmpty(message) {
  grid.hidden = true; empty.hidden = false;
  empty.querySelector('h1').textContent = message;
  empty.querySelector('p').textContent = AUTO_MODE
    ? 'Return to Monsnode and choose Open Auto Multi Player from a page with videos.'
    : 'Open Monsnode search results and select between one and sixteen videos.';
}

async function getVideoUrl(item) {
  if (item.videoUrl) return item.videoUrl;
  if (mediaUrlCache.has(item.redirectUrl)) return mediaUrlCache.get(item.redirectUrl);
  const pending = (async () => {
    const response = await fetch(item.redirectUrl, { credentials: 'include' });
    if (!response.ok) throw new Error('Could not load the Monsnode video link.');
    const html = await response.text();
    const encoded = html.match(/var\s+u\s*=\s*atob\(['"]([A-Za-z0-9+/=]+)['"]\)/);
    let mediaUrl = encoded ? atob(encoded[1]) : '';
    if (!mediaUrl) mediaUrl = new DOMParser().parseFromString(html, 'text/html').querySelector('#main_link')?.getAttribute('href') || '';
    const media = new URL(mediaUrl);
    if (media.hostname !== 'video.twimg.com' || !/\.mp4$/i.test(media.pathname)) throw new Error('No compatible MP4 video was found.');
    return media.href;
  })();
  mediaUrlCache.set(item.redirectUrl, pending);
  try { return await pending; } catch (error) { mediaUrlCache.delete(item.redirectUrl); throw error; }
}

function updateAutoControls(slot) {
  slot.back.disabled = slot.history.length === 0;
  slot.next.disabled = playlistExhausted && nextPlaylistIndex >= autoPlaylist.length;
}

function makeNextPageUrl() {
  if (!autoSourceUrl) return null;
  const url = new URL(autoSourceUrl);
  if (url.hostname !== 'monsnode.com' || !['/', '/search.php'].includes(url.pathname)) return null;
  const currentPage = Number(url.searchParams.get('page') || 1);
  url.searchParams.set('page', String(nextPageNumber || currentPage + 1));
  return url.href;
}

function videosFromPage(html, pageUrl) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const seen = new Set(autoPlaylist.map(item => item.id));
  return [...doc.querySelectorAll('a[href*="/redirect.php?v="]')].flatMap(anchor => {
    try {
      const url = new URL(anchor.getAttribute('href'), pageUrl);
      const card = anchor.closest('.listn');
      const id = card?.id;
      const image = anchor.querySelector('img');
      if (url.hostname !== 'monsnode.com' || url.pathname !== '/redirect.php' || !id || !image || seen.has(id)) return [];
      seen.add(id);
      const title = (image.alt || card.querySelector('.user')?.textContent || `Video ${id}`).trim().replace(/\s+/g, ' ');
      return [{ id, redirectUrl: url.href, pageUrl: `https://monsnode.com/v${id}`, title: title.slice(0, 180) }];
    } catch { return []; }
  });
}

async function fetchMoreVideos() {
  if (playlistExhausted) return;
  if (!nextPageFetch) {
    const pageUrl = makeNextPageUrl();
    if (!pageUrl) { playlistExhausted = true; return; }
    const requestedPage = Number(new URL(pageUrl).searchParams.get('page'));
    nextPageFetch = (async () => {
      try {
        const response = await fetch(pageUrl, { credentials: 'include' });
        if (!response.ok) throw new Error(`Page request failed (${response.status})`);
        const items = videosFromPage(await response.text(), pageUrl);
        if (!items.length) playlistExhausted = true;
        else {
          autoPlaylist.push(...items);
          nextPageNumber = requestedPage + 1;
        }
      } catch (error) {
        playlistExhausted = true;
        console.warn('Auto Multi Player could not load the next Monsnode page:', error);
      }
    })().finally(() => { nextPageFetch = null; });
  }
  await nextPageFetch;
}

async function takeNextAutoItem() {
  while (nextPlaylistIndex >= autoPlaylist.length && !playlistExhausted) await fetchMoreVideos();
  return nextPlaylistIndex < autoPlaylist.length ? autoPlaylist[nextPlaylistIndex++] : null;
}

async function loadAutoItem(slot, item, rememberCurrent) {
  if (!item) return;
  if (rememberCurrent && slot.item) slot.history.push(slot.item);
  const token = ++slot.loadToken;
  slot.item = item;
  slot.video.controls = true;
  slot.title.textContent = item.title || `Video ${slot.order + 1}`;
  slot.link.href = item.pageUrl || `https://monsnode.com/v${item.id}`;
  slot.video.pause(); slot.video.removeAttribute('src'); slot.video.load();
  updateAutoControls(slot);
  try {
    const videoUrl = await getVideoUrl(item);
    if (token !== slot.loadToken) return;
    item.videoUrl = videoUrl;
    slot.video.src = videoUrl;
    slot.video.muted = false;
    slot.video.load();
    slot.video.play().catch(error => {
      if (error?.name === 'NotAllowedError' && token === slot.loadToken) {
        slot.title.textContent = `${item.title || 'Video'} — press Play to start`;
      }
    });
  } catch (error) {
    if (token === slot.loadToken) slot.title.textContent = `${item.title || 'Video'} — ${error.message}`;
  }
  updateAutoControls(slot);
}

async function playNext(slot) {
  if (!AUTO_MODE) return;
  slot.next.disabled = true;
  const item = await takeNextAutoItem();
  if (item) await loadAutoItem(slot, item, true);
  updateAutoControls(slot);
}

function goBack(slot) {
  if (!AUTO_MODE || !slot.history.length) return;
  const previous = slot.history.pop();
  loadAutoItem(slot, previous, false);
}

function stepSelectedVideo(slot, direction) {
  if (AUTO_MODE) {
    if (direction < 0) goBack(slot); else playNext(slot);
    return;
  }
  const nextIndex = slot.playlistIndex + direction;
  if (nextIndex < 0 || nextIndex >= slot.playlist.length) return;
  const item = slot.playlist[nextIndex];
  slot.playlistIndex = nextIndex;
  slot.item = item;
  slot.title.textContent = item.title || `Video ${slot.order + 1}`;
  slot.link.href = item.pageUrl || `https://monsnode.com/v${item.id}`;
  slot.video.pause(); slot.video.removeAttribute('src'); slot.video.load();
  slot.video.src = item.videoUrl;
  slot.video.muted = false;
  slot.video.load(); slot.video.play().catch(() => {});
}

async function startAuto(items, sourceUrl = autoSourceUrl) {
  const sourceChanged = sourceUrl !== autoSourceUrl || autoPlaylist.length === 0;
  autoPlaylist = Array.isArray(items) ? items.filter(item => item?.redirectUrl && item?.id) : [];
  autoSourceUrl = sourceUrl || '';
  if (sourceChanged) {
    const source = autoSourceUrl ? new URL(autoSourceUrl) : null;
    nextPageNumber = source ? Number(source.searchParams.get('page') || 1) + 1 : 0;
    playlistExhausted = !source || !['/', '/search.php'].includes(source.pathname);
  }
  while (autoPlaylist.length < playerCount && !playlistExhausted) await fetchMoreVideos();
  if (autoPlaylist.length < playerCount) { showEmpty(`At least ${playerCount} videos are needed`); return; }
  nextPlaylistIndex = playerCount;
  grid.hidden = false; empty.hidden = true;
  slots.slice(0, playerCount).forEach((slot, index) => { slot.back.hidden = false; slot.next.hidden = false; loadAutoItem(slot, autoPlaylist[index], false); });
}

function applySelection(items) {
  const allItems = Array.isArray(items) ? items.filter(item => item?.videoUrl && item?.id) : [];
  availableSelectedCount = allItems.length;
  updateCountOptions();
  const videos = allItems.slice(0, playerCount);
  selectedItems = videos;
  if (slots.length < playerCount) while (slots.length < playerCount) slots.push(createSlot(slots.length));
  if (!videos.length) { showEmpty('Select videos'); return; }
  grid.hidden = false; empty.hidden = true;

  const selectedIds = new Set(videos.map(item => item.id));
  for (const slot of slots.slice(0, playerCount)) slot.selected = Boolean(slot.item && selectedIds.has(slot.item.id));
  for (const item of videos) {
    if (slots.slice(0, playerCount).some(slot => slot.item?.id === item.id)) continue;
    const slot = slots.slice(0, playerCount).find(candidate => !candidate.selected);
    if (!slot) break;
    slot.item = item; slot.selected = true;
    slot.video.controls = true;
    slot.video.pause(); slot.video.removeAttribute('src'); slot.video.load();
    slot.video.src = item.videoUrl;
    slot.video.muted = false;
    slot.video.load(); slot.video.play().catch(() => {});
    slot.video.title = item.title || `Video ${slot.order + 1}`;
    slot.title.textContent = item.title || `Video ${slot.order + 1}`;
    slot.link.href = item.pageUrl || `https://monsnode.com/v${item.id}`;
  }
  for (const slot of slots.slice(0, playerCount)) {
    if (slot.item && !videos.some(item => item.id === slot.item.id)) {
      slot.video.pause(); slot.video.removeAttribute('src'); slot.video.load();
      slot.video.controls = false; slot.item = null; slot.selected = false;
      slot.title.textContent = ''; slot.link.removeAttribute('href');
    }
    slot.playlist = videos;
    slot.playlistIndex = videos.findIndex(item => item.id === slot.item?.id);
  }
}

function operate(video, binding) {
  const amount = Number(binding.value);
  if (binding.action === 'rewind' || binding.action === 'advance') {
    const delta = amount * (binding.action === 'rewind' ? -1 : 1);
    video.currentTime = Math.max(0, Math.min(Number.isFinite(video.duration) ? video.duration : Infinity, video.currentTime + delta));
  } else if (binding.action === 'decrease') video.playbackRate = Math.max(0.1, video.playbackRate - amount);
  else if (binding.action === 'increase') video.playbackRate = Math.min(16, video.playbackRate + amount);
  else if (binding.action === 'reset' || binding.action === 'preferred') video.playbackRate = amount;
  else if (binding.action === 'speedToggle') video.playbackRate = Math.abs(video.playbackRate - amount) < 0.01 ? 1 : amount;
  else if (binding.action === 'toggle') {
    if (video.paused || video.ended) video.play().catch(() => {}); else video.pause();
  } else if (binding.action === 'mute') video.muted = !video.muted;
  else if (binding.action === 'volumeUp') { video.volume = Math.min(1, video.volume + (amount || 0.1)); video.muted = false; }
  else if (binding.action === 'volumeDown') { video.volume = Math.max(0, video.volume - (amount || 0.1)); if (!video.volume) video.muted = true; }
}

function operateAll(binding) {
  const players = visibleSlots();
  if (binding.action === 'toggleAll') {
    const pauseAll = players.some(slot => !slot.video.paused && !slot.video.ended);
    for (const slot of players) {
      if (pauseAll) slot.video.pause();
      else slot.video.play().catch(() => {});
    }
  } else if (binding.action === 'muteAll') {
    const muteAll = players.some(slot => !slot.video.muted);
    for (const slot of players) slot.video.muted = muteAll;
  }
  updateToggleAllButton();
}

countSelect.addEventListener('change', () => {
  playerCount = Number(countSelect.value);
  if (AUTO_MODE) {
    setPlayerCount(playerCount); startAuto(autoPlaylist, autoSourceUrl);
  } else {
    setPlayerCount(playerCount);
    chrome.storage.local.get({ selectedVideos: [] }, ({ selectedVideos }) => applySelection(selectedVideos));
  }
});
chrome.storage.local.get({ selectedVideos: [], autoPlaylist: [], autoSourceUrl: '' }, result => {
  if (!AUTO_MODE) { availableSelectedCount = result.selectedVideos.filter(item => item?.videoUrl && item?.id).length; updateCountOptions(); }
  const selectedCount = result.selectedVideos.filter(item => item?.videoUrl && item?.id).length;
  const initialCount = selectedCount <= 1 ? 1 : selectedCount <= 2 ? 2 : selectedCount <= 4 ? 4 : selectedCount <= 9 ? 9 : 16;
  setPlayerCount(AUTO_MODE ? 4 : initialCount);
  if (AUTO_MODE) startAuto(result.autoPlaylist, result.autoSourceUrl);
  else applySelection(result.selectedVideos);
});
document.querySelector('#fullscreen').addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.();
});
document.addEventListener('keydown', event => {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.target instanceof HTMLElement && (event.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName))) return;
  const pressedKey = event.key.toLowerCase();
  if (event.shiftKey) {
    const shiftedKey = event.code === 'Space' ? 'Shift+Space' : `Shift+${pressedKey}`;
    const shiftedBinding = bindings[shiftedKey];
    if (shiftedBinding && ['toggleAll', 'muteAll'].includes(shiftedBinding.action)) {
      event.preventDefault();
      operateAll(shiftedBinding);
    }
    return;
  }
  if (pressedKey === 'b' || pressedKey === 'n') {
    const slot = slots[activeSlot];
    if (!slot?.item) return;
    event.preventDefault();
    stepSelectedVideo(slot, pressedKey === 'b' ? -1 : 1);
    return;
  }
  const binding = event.code === 'Space' ? bindings.Space : bindings[event.key.toLowerCase()];
  const slot = slots[activeSlot];
  if (!binding || !slot?.item) return;
  event.preventDefault(); operate(slot.video, binding);
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (!AUTO_MODE && area === 'local' && changes.selectedVideos) applySelection(changes.selectedVideos.newValue);
  if (area === 'sync' && changes.keyBindings) bindings = { ...DEFAULTS, ...normalizeBindings(changes.keyBindings.newValue) };
});
chrome.storage.sync.get({ keyBindings: DEFAULTS }, result => { bindings = { ...DEFAULTS, ...normalizeBindings(result.keyBindings) }; });
document.querySelector('#search-link').href = SEARCH_URL;
