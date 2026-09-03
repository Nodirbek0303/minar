export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data || {};
  }
}

async function req(url, opts = {}) {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...opts
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || 'Server xatosi: ' + res.status, res.status, data);
  return data;
}

export const api = {
  login: (password) => req('/api/login', { method: 'POST', body: JSON.stringify({ password }) }),
  logout: () => req('/api/logout', { method: 'POST' }),
  authStatus: () => req('/api/auth-status'),

  upload: async (file) => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/upload', { method: 'POST', credentials: 'include', body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(data.error || 'Fayl yuklanmadi', res.status, data);
    return data;
  },
  // Bir vaqtda bir necha fayl yuklash
  uploadMany: async (files) => {
    const fd = new FormData();
    for (const f of files) fd.append('files', f);
    const res = await fetch('/api/upload', { method: 'POST', credentials: 'include', body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(data.error || 'Fayllar yuklanmadi', res.status, data);
    return data;
  },
  // units: undefined | 'mm' | 'cm' | 'm' — chizma birligini qo'lda ko'rsatish
  analyze: (fileId, units) => req('/api/analyze', { method: 'POST', body: JSON.stringify({ fileId, units }) }),
  // Barcha yuklangan hujjatlarni BIRGA tahlil qilish
  analyzeBatch: (fileIds, { units, scheme } = {}) =>
    req('/api/analyze-batch', { method: 'POST', body: JSON.stringify({ fileIds, units, scheme }) }),
  capabilities: () => req('/api/capabilities'),
  listProjects: () => req('/api/projects'),
  getProject: (id) => req('/api/projects/' + id),
  createProject: (name, plan, wallMaterial, scheme) =>
    req('/api/projects', { method: 'POST', body: JSON.stringify({ name, plan, wallMaterial, scheme }) }),
  updateProject: (id, body) => req('/api/projects/' + id, { method: 'PUT', body: JSON.stringify(body) }),
  updateFloors: (id, floors) => req('/api/projects/' + id + '/floors', { method: 'PUT', body: JSON.stringify({ floors }) }),
  deleteProject: (id) => req('/api/projects/' + id, { method: 'DELETE' }),
  chat: (message, history, projectId) => req('/api/ai/chat', { method: 'POST', body: JSON.stringify({ message, history, projectId }) }),
  samplePlan: () => req('/api/sample-plan'),
  ratesDefaults: () => req('/api/rates-defaults'),
  aiStatus: () => req('/api/ai-status')
};

export const som = (n) => new Intl.NumberFormat('uz-UZ').format(Math.round(Number(n) || 0)) + " so'm";
export const mln = (n) => ((Number(n) || 0) / 1e6).toFixed(1) + ' mln';
export const qty = (n) => new Intl.NumberFormat('uz-UZ', { maximumFractionDigits: 2 }).format(Number(n) || 0);
