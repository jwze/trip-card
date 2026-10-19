const fields = [
  { id: 'phone', key: '_phone', label: '手机号码', fallback: '13800100000', format: value => value.slice(0, 3) + '****' + value.slice(-4) },
  { id: 'places', key: '_trip_card_places', label: '途经地点（以逗号分隔）', fallback: '北京市', format: value => value.replaceAll('，', ',') },
];

// Storage can be disabled in private browsing; editing still works for this visit.
function readValue(field) {
  try { return localStorage.getItem(field.key) || field.fallback; }
  catch { return field.fallback; }
}

for (const field of fields) {
  const element = document.getElementById(field.id);
  let value = readValue(field);
  const render = () => { element.textContent = field.format(value); };
  render();
  element.addEventListener('click', () => {
    const input = window.prompt(`修改${field.label}：`, value);
    if (input === null) return;
    value = input.trim() || field.fallback;
    try {
      if (input.trim()) localStorage.setItem(field.key, value);
      else localStorage.removeItem(field.key);
    } catch { /* Keep the in-memory value when storage is unavailable. */ }
    render();
  });
  field.reset = () => {
    try { localStorage.removeItem(field.key); } catch { /* Storage is optional. */ }
    value = field.fallback;
    render();
  };
}

const time = document.getElementById('datetime');
const now = new Date();
time.dateTime = now.toISOString();
time.textContent = new Date(now.getTime() + 8 * 3600_000).toISOString().slice(0, 19).replace('T', ' ').replaceAll('-', '.');

document.getElementById('reset').addEventListener('click', () => {
  if (window.confirm('重置手机号和途经地点？')) fields.forEach(field => field.reset());
});

// Keep development cache-free. Production paths are relative to this app,
// including when GitHub Pages serves it from /trip-card/.
if ('serviceWorker' in navigator && !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) {
  navigator.serviceWorker.register(new URL('./service-worker.js', import.meta.url), { scope: './' })
    .catch(error => console.warn('离线功能暂不可用：', error));
}
