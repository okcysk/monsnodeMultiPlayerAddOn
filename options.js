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
const ACTIONS = [
  ['decrease', 'Decrease speed'],
  ['increase', 'Increase speed'],
  ['reset', 'Reset speed'],
  ['preferred', 'Preferred speed'],
  ['speedToggle', 'Toggle speed (reset to 1×)'],
  ['advance', 'Advance'],
  ['rewind', 'Rewind'],
  ['toggle', 'Play / pause'],
  ['mute', 'Mute / unmute'],
  ['volumeUp', 'Increase volume'],
  ['volumeDown', 'Decrease volume']
];
const rows = document.querySelector('#rows');
const status = document.querySelector('#status');

function actionOptions(selected) {
  return ACTIONS.map(([value, label]) => `<option value="${value}"${value === selected ? ' selected' : ''}>${label}</option>`).join('');
}

function addRow(key = '', binding = { action: 'advance', value: 5 }) {
  const row = document.createElement('div');
  row.className = 'row';
  const action = document.createElement('select');
  action.className = 'action';
  action.setAttribute('aria-label', 'Action');
  action.innerHTML = actionOptions(binding.action);
  const keyInput = document.createElement('input');
  keyInput.className = 'key';
  keyInput.maxLength = 8;
  keyInput.value = key;
  keyInput.placeholder = 'Key';
  keyInput.setAttribute('aria-label', 'Shortcut key');
  keyInput.addEventListener('keydown', event => {
    if (event.code === 'Space') { event.preventDefault(); keyInput.value = 'Space'; }
    else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); keyInput.value = event.key; }
    else if (event.key.length === 1 && /^[a-z0-9]$/i.test(event.key)) { event.preventDefault(); keyInput.value = event.key.toLowerCase(); }
  });
  const value = document.createElement('input');
  value.className = 'value';
  value.type = 'number';
  value.min = '0.1';
  value.step = '0.01';
  value.value = binding.action === 'toggle' ? '' : Math.abs(Number(binding.value));
  value.setAttribute('aria-label', 'Action value');
  const unit = document.createElement('span');
  unit.className = 'unit';
  const remove = document.createElement('button');
  remove.className = 'remove';
  remove.type = 'button';
  remove.textContent = '×';
  remove.title = 'Remove binding';
  remove.setAttribute('aria-label', 'Remove binding');
  remove.addEventListener('click', () => row.remove());
  const refresh = () => {
    const type = action.value;
    const isSpeed = ['decrease', 'increase', 'reset', 'preferred', 'speedToggle'].includes(type);
    const noValue = ['toggle', 'mute'].includes(type);
    const isVolume = ['volumeUp', 'volumeDown'].includes(type);
    value.disabled = noValue;
    value.step = isSpeed || isVolume ? '0.01' : '0.5';
    value.min = isSpeed || isVolume ? '0.01' : '0.5';
    unit.textContent = isSpeed ? '× speed' : isVolume ? 'volume' : noValue ? 'No value' : 'seconds';
    if (noValue) value.value = '';
    else if (!value.value) value.value = type === 'reset' ? '1' : type === 'preferred' || type === 'speedToggle' ? '2.5' : isVolume ? '0.1' : isSpeed ? '0.1' : '5';
  };
  action.addEventListener('change', refresh);
  row.append(action, keyInput, value, unit, remove);
  rows.append(row);
  refresh();
}

function render(bindings) {
  rows.replaceChildren();
  for (const [key, binding] of Object.entries(bindings)) addRow(key, binding);
}

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

function collect() {
  const bindings = {};
  for (const row of rows.children) {
    const action = row.querySelector('.action').value;
    const rawKey = row.querySelector('.key').value.trim();
    const key = rawKey.toLowerCase() === 'space' ? 'Space' : rawKey.toLowerCase();
    const needsValue = !['toggle', 'mute'].includes(action);
    const value = needsValue ? Number(row.querySelector('.value').value) : 0;
    if ((!/^[a-z0-9]$/.test(key) && !['Space', 'arrowup', 'arrowdown'].includes(key)) || bindings[key]) {
      throw new Error('Use a unique letter, number, Space, ArrowUp, or ArrowDown key for each binding.');
    }
    if (needsValue && (!Number.isFinite(value) || value <= 0 || (['reset', 'preferred', 'speedToggle'].includes(action) && value > 16))) {
      throw new Error(['reset', 'preferred', 'speedToggle'].includes(action) ? 'Playback speed must be between 0.1 and 16.' : 'Enter a value greater than zero.');
    }
    bindings[key] = { action, value };
  }
  return bindings;
}

chrome.storage.sync.get({ keyBindings: DEFAULTS }, result => {
  render({ ...DEFAULTS, ...normalizeBindings(result.keyBindings) });
});
document.querySelector('#add').addEventListener('click', () => addRow());
document.querySelector('#save').addEventListener('click', () => {
  try {
    const keyBindings = collect();
    chrome.storage.sync.set({ keyBindings }, () => {
      status.textContent = 'Options saved';
      setTimeout(() => { status.textContent = ''; }, 1800);
    });
  } catch (error) { status.textContent = error.message; }
});
document.querySelector('#reset').addEventListener('click', () => {
  render(DEFAULTS);
  chrome.storage.sync.set({ keyBindings: DEFAULTS }, () => { status.textContent = 'Default options restored'; });
});
