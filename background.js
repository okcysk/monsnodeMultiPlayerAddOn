const SEARCH_URL = 'https://monsnode.com/';

function openPlayer() {
  chrome.storage.local.get({ selectedVideos: [] }, ({ selectedVideos }) => {
    const ready = selectedVideos.length >= 1 && selectedVideos.length <= 16 && selectedVideos.every(item => item.videoUrl);
    const path = ready ? 'player.html' : 'player.html?choose=1';
    chrome.tabs.create({ url: chrome.runtime.getURL(path) });
  });
}

chrome.action.onClicked.addListener(openPlayer);
chrome.runtime.onMessage.addListener(message => {
  if (message?.type === 'open-quad-player') openPlayer();
  if (message?.type === 'open-auto-quad-player') chrome.tabs.create({ url: chrome.runtime.getURL('player.html?auto=1') });
  if (message?.type === 'open-search') chrome.tabs.create({ url: SEARCH_URL });
});
