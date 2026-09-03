import * as THREE from 'three';

// ============================================================
//  WebGL kontekstini ishonchli ochish.
//
//  Bitta urinish yetarli emas: ba'zi kompyuterlarda antialias yoki
//  preserveDrawingBuffer bilan kontekst ochilmaydi, integratsiyalangan
//  videokartada esa "major performance caveat" sababli rad etiladi.
//  Shuning uchun sozlamalar yengillashib boradigan bir necha variant
//  ketma-ket sinaladi — birortasi ishlasa, 3D chiziladi.
// ============================================================

const VARIANTS = [
  // 1. To'liq sifat: silliqlash + PNG saqlash imkoniyati
  { antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' },
  // 2. Silliqlashsiz (eski videokartalarda ko'pincha shu ishlaydi)
  { antialias: false, preserveDrawingBuffer: true, powerPreference: 'default' },
  // 3. Kam quvvatli rejim, PNG buferisiz
  { antialias: false, preserveDrawingBuffer: false, powerPreference: 'low-power' },
  // 4. Eng yengil: sekin dasturiy renderni ham qabul qilamiz
  { antialias: false, preserveDrawingBuffer: false, failIfMajorPerformanceCaveat: false, depth: true, stencil: false }
];

// Qaytadi: { renderer, canPng } yoki xato uloqtiradi
export function createRenderer(extra = {}) {
  let lastErr = null;
  for (const v of VARIANTS) {
    try {
      const renderer = new THREE.WebGLRenderer({ ...v, ...extra });
      // Kontekst haqiqatan ochilganini tekshirish (ba'zi brauzerlar xato bermay null qaytaradi)
      if (!renderer.getContext()) throw new Error('WebGL konteksti bo‘sh qaytdi');
      return { renderer, canPng: v.preserveDrawingBuffer !== false };
    } catch (e) {
      lastErr = e;
    }
  }
  const err = new Error(lastErr?.message || 'WebGL kontekstini yaratib bo‘lmadi');
  err.diagnostics = webglDiagnostics();
  throw err;
}

// Brauzer imkoniyatlarini aniqlash — foydalanuvchiga aniq sabab ko'rsatish uchun
export function webglDiagnostics() {
  const out = { webgl2: false, webgl1: false, gpu: null, reason: '' };
  if (typeof document === 'undefined') return out;
  let cv;
  try {
    cv = document.createElement('canvas');
    const gl2 = cv.getContext('webgl2');
    out.webgl2 = !!gl2;
    const gl = gl2 || cv.getContext('webgl') || cv.getContext('experimental-webgl');
    out.webgl1 = !!gl;
    if (gl) {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      if (dbg) out.gpu = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
      else out.gpu = gl.getParameter(gl.RENDERER);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch (e) {
    out.reason = e.message;
  }
  if (!out.webgl1 && !out.webgl2) {
    out.reason = out.reason || 'Brauzerda WebGL butunlay o‘chirilgan yoki videokarta qo‘llab-quvvatlanmaydi';
  }
  return out;
}

// Kontekst yo'qolganda (videokarta drayveri qayta ishga tushsa) sahifa
// qulamasligi uchun: brauzerning standart xatti-harakatini to'xtatib,
// chaqiruvchiga xabar beramiz.
export function watchContextLoss(renderer, onLost) {
  const canvas = renderer.domElement;
  const handler = (e) => { e.preventDefault(); onLost?.(); };
  canvas.addEventListener('webglcontextlost', handler, false);
  return () => canvas.removeEventListener('webglcontextlost', handler, false);
}
