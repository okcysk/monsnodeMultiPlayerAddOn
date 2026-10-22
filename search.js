(() => {
  const isDetailPage = /^\/v\d+\/?$/.test(location.pathname);
  if (window.top !== window || window.__monsnodeQuadSearchLoaded || !(location.pathname === '/' || /^\/search\.php$/.test(location.pathname) || isDetailPage)) return;
  window.__monsnodeQuadSearchLoaded = true;

  const STYLE_ID = 'mnqp-style';
  const PANEL_ID = 'mnqp-panel';
  let selected = [];
  let noticeTimer;
  const styles = `
    .mnqp-check{position:absolute!important;z-index:2147483646!important;top:8px!important;left:8px!important;width:36px!important;height:36px!important;margin:0!important;accent-color:#c4f26a!important;cursor:pointer!important;filter:drop-shadow(0 1px 3px #000)!important}
    #${PANEL_ID}{position:fixed;z-index:2147483647;right:18px;bottom:18px;display:flex;align-items:center;gap:12px;padding:12px 14px;background:#16181eef;border:1px solid #41444e;border-radius:14px;color:#f7f7fa;font:14px/1.4 system-ui,sans-serif;box-shadow:0 8px 30px #0008}
    #${PANEL_ID} .mnqp-count{min-width:112px;font-weight:650}#${PANEL_ID} .mnqp-message{position:absolute;right:0;bottom:calc(100% + 8px);padding:7px 10px;border-radius:8px;background:#3b2424;color:#ffd5d5;white-space:nowrap;font-size:12px;opacity:0;transition:opacity .15s;pointer-events:none}#${PANEL_ID}.mnqp-error .mnqp-message{opacity:1}
    #${PANEL_ID} button{border:0;border-radius:9px;padding:9px 12px;background:#c4f26a;color:#18200f;font:700 13px system-ui,sans-serif;cursor:pointer}#${PANEL_ID} button:disabled{opacity:.42;cursor:not-allowed}#${PANEL_ID} .mnqp-clear{background:#30333c;color:#f3f3f5}#${PANEL_ID} .mnqp-actions{display:flex;flex-direction:column;gap:6px}#${PANEL_ID} .mnqp-actions button{white-space:nowrap}#${PANEL_ID} .mnqp-links{display:flex;align-items:center;gap:8px;margin-left:2px}#${PANEL_ID} .mnqp-links a{display:grid;place-items:center;width:30px;height:30px;border:1px solid #555862;border-radius:50%;color:#e9ebef;text-decoration:none}#${PANEL_ID} .mnqp-links a:hover{color:#c4f26a;border-color:#c4f26a}#${PANEL_ID} .mnqp-links svg{width:16px;height:16px;fill:currentColor}
    .listn{position:relative!important}
    @media(max-width:600px){#${PANEL_ID}{left:12px;right:12px;bottom:12px;justify-content:space-between;gap:6px;padding:9px}#${PANEL_ID} .mnqp-count{min-width:auto;font-size:12px}#${PANEL_ID} button{padding:8px;font-size:12px}#${PANEL_ID} .mnqp-links{gap:4px}#${PANEL_ID} .mnqp-links a{width:28px;height:28px}}
  `;

  function addStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style'); style.id = STYLE_ID; style.textContent = styles;
    (document.head || document.documentElement).append(style);
  }

  function videoInfo(anchor, baseUrl = location.href) {
    try {
      const url = new URL(anchor.getAttribute('href') || anchor.href, baseUrl);
      if (url.hostname !== 'monsnode.com' || url.pathname !== '/redirect.php') return null;
      const card = anchor.closest('.listn');
      const id = card?.id;
      const image = anchor.querySelector('img');
      if (!id || !image) return null;
      const title = (image.alt || card.querySelector('.user')?.innerText || `Video ${id}`).trim().replace(/\s+/g, ' ');
      return { id, redirectUrl: url.href, pageUrl: `https://monsnode.com/v${id}`, title: title.slice(0, 180) };
    } catch { return null; }
  }

  async function resolveVideo(info) {
    const response = await fetch(info.redirectUrl, { credentials: 'include' });
    if (!response.ok) throw new Error('Video link could not be loaded.');
    const html = await response.text();
    const encoded = html.match(/var\s+u\s*=\s*atob\(['"]([A-Za-z0-9+/=]+)['"]\)/);
    let mediaUrl = encoded ? atob(encoded[1]) : '';
    if (!mediaUrl) {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      mediaUrl = doc.querySelector('#main_link')?.getAttribute('href') || '';
    }
    const media = new URL(mediaUrl);
    if (media.hostname !== 'video.twimg.com' || !/\.mp4$/i.test(media.pathname)) throw new Error('No compatible MP4 video was found.');
    return media.href;
  }

  function persist() { chrome.storage.local.set({ selectedVideos: selected }); }
  function updatePanel() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    panel.querySelector('.mnqp-count').textContent = isDetailPage ? 'Videos on this page' : `${selected.length} selected (1–16)`;
    panel.querySelector('.mnqp-open').disabled = selected.length < 1 || selected.length > 16 || selected.some(item => !item.videoUrl);
  }
  function collectVideos(root = document, baseUrl = location.href) {
    const seen = new Set();
    return [...root.querySelectorAll('a[href*="/redirect.php?v="]')]
      .map(anchor => videoInfo(anchor, baseUrl)).filter(item => item && !seen.has(item.id) && seen.add(item.id));
  }
  async function collectAutoPlaylist() {
    if (!isDetailPage) return { playlist: collectVideos(), sourceUrl: location.href };
    const pageVideos = collectVideos(document, location.href);
    const sourceUrl = new URL('/?page=1', location.origin).href;
    let homeVideos = [];
    try {
      const response = await fetch(sourceUrl, { credentials: 'include' });
      if (!response.ok) throw new Error('Could not load the Monsnode video list.');
      const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
      homeVideos = collectVideos(doc, sourceUrl);
    } catch (cause) {
      if (pageVideos.length < 4) throw cause;
    }
    const seen = new Set();
    const playlist = [...pageVideos, ...homeVideos].filter(item => !seen.has(item.id) && seen.add(item.id));
    return { playlist, sourceUrl };
  }
  function error(message) {
    const panel = document.getElementById(PANEL_ID); if (!panel) return;
    panel.querySelector('.mnqp-message').textContent = message;
    panel.classList.add('mnqp-error'); clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => panel.classList.remove('mnqp-error'), 2600);
  }

  function buildPanel() {
    if (document.getElementById(PANEL_ID)) return;
    const panel = document.createElement('div'); panel.id = PANEL_ID;
    panel.innerHTML = '<span class="mnqp-count">0 selected (1–16)</span><span class="mnqp-message" aria-live="polite"></span><button type="button" class="mnqp-clear">Clear</button><span class="mnqp-actions"><button type="button" class="mnqp-auto">Open Auto Multi Player</button><button type="button" class="mnqp-open" disabled>Open Multi Player</button></span><nav class="mnqp-links" aria-label="Contact links"><a href="mailto:okcysk@gmail.com" aria-label="Email" title="Email"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zm9 7L3 7v10h18V7l-9 5zm0-2 7-3H5l7 3z"/></svg></a><a href="https://x.com/okcysk46770" target="_blank" rel="noopener noreferrer" aria-label="X" title="X"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.9 2H22l-6.78 7.75L23.2 22h-6.25l-4.9-7.42L5.56 22H2.43l7.25-8.28L1.8 2h6.4l4.43 6.78L18.9 2zm-1.1 18h1.73L7.26 3.9H5.4L17.8 20z"/></svg></a></nav>';
    if (isDetailPage) {
      panel.querySelector('.mnqp-count').textContent = 'Videos on this page';
      panel.querySelector('.mnqp-clear').hidden = true;
      panel.querySelector('.mnqp-open').hidden = true;
    }
    panel.querySelector('.mnqp-clear').addEventListener('click', () => {
      selected = [];
      for (const input of document.querySelectorAll('.mnqp-check')) input.checked = false;
      persist(); updatePanel();
    });
    panel.querySelector('.mnqp-open').addEventListener('click', () => {
      if (selected.length < 1 || selected.length > 16) return;
      if (selected.some(item => !item.videoUrl)) { error('Preparing video links. Please wait.'); return; }
      chrome.storage.local.set({ selectedVideos: selected }, () => chrome.runtime.sendMessage({ type: 'open-quad-player' }));
    });
    panel.querySelector('.mnqp-auto').addEventListener('click', async event => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        const { playlist, sourceUrl } = await collectAutoPlaylist();
        if (playlist.length < 4) { error('At least four videos are needed for auto playback.'); return; }
        chrome.storage.local.set({ autoPlaylist: playlist, autoSourceUrl: sourceUrl, selectedVideos: [] }, () => chrome.runtime.sendMessage({ type: 'open-auto-quad-player' }));
      } catch (cause) {
        error(cause.message || 'Could not prepare the video list.');
      } finally { button.disabled = false; }
    });
    document.body.append(panel);
    selected = [];
    if (isDetailPage) { scan(); updatePanel(); }
    else chrome.storage.local.set({ selectedVideos: [] }, () => { scan(); updatePanel(); });
  }

  function scan() {
    addStyle(); buildPanel();
    for (const anchor of document.querySelectorAll('a[href*="/redirect.php?v="]')) {
      const info = videoInfo(anchor);
      if (!info || anchor.querySelector('.mnqp-check')) continue;
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.className = 'mnqp-check';
      checkbox.dataset.videoId = info.id;
      checkbox.checked = selected.some(item => item.id === info.id);
      checkbox.setAttribute('aria-label', `Select ${info.title}`); checkbox.title = 'Select video';
      checkbox.addEventListener('click', event => event.stopPropagation());
      checkbox.addEventListener('change', async event => {
        event.stopPropagation();
        if (checkbox.checked) {
          if (selected.length >= 16) { checkbox.checked = false; error('Select up to sixteen videos.'); return; }
          if (selected.some(item => item.id === info.id)) return;
          const item = { ...info, videoUrl: '' };
          selected.push(item); persist(); updatePanel();
          try {
            item.videoUrl = await resolveVideo(info);
            if (selected.some(current => current.id === info.id)) { persist(); updatePanel(); }
          } catch (cause) {
            selected = selected.filter(current => current.id !== info.id);
            for (const input of document.querySelectorAll(`.mnqp-check[data-video-id="${CSS.escape(info.id)}"]`)) input.checked = false;
            persist(); updatePanel(); error(cause.message || 'Could not resolve the video.');
          }
        } else {
          selected = selected.filter(item => item.id !== info.id); persist(); updatePanel();
        }
      });
      anchor.append(checkbox);
    }
  }

  const observer = new MutationObserver(scan);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  scan();
})();
