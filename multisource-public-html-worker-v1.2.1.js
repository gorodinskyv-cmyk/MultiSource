/**
 * MultiSource public HTML adapter v1.2.1 (Cloudflare Worker).
 * Explicitly allow-listed public HTML from UAFix and UAKino ONLY.
 * No credentials, authentication bypass, stream proxying or DRM handling.
 * If a site blocks the Worker, we propagate the error; do not evade it.
 */
const ALLOWED = new Set(['uafix.net', 'uakino.best']);
const MAX_HTML_BYTES = 1_500_000;
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '3600',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff'
};
function json(value, status = 200) {
  return new Response(JSON.stringify(value), {status, headers: {...CORS, 'Content-Type': 'application/json; charset=utf-8'}});
}
function allowedUrl(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || !ALLOWED.has(url.hostname) || url.port || url.username || url.password) return null;
    if (url.href.length > 2048) return null;
    return url;
  } catch (_) { return null; }
}
export default {
  async fetch(request) {
    const requestUrl = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers: CORS});
    if (request.method !== 'GET') return json({ok:false,error:'method_not_allowed'},405);
    if (requestUrl.pathname === '/health') return json({ok:true, service:'lampa-multisource-public-html', version:'1.2.1', domains:[...ALLOWED]});
    if (requestUrl.pathname !== '/fetch') return json({ok:false,error:'not_found'},404);
    const target = allowedUrl(requestUrl.searchParams.get('url'));
    if (!target) return json({ok:false,error:'url_not_allowed'},400);
    try {
      const reply = await fetch(target.href, {
        method:'GET', redirect:'manual',
        headers: {'Accept':'text/html,application/xhtml+xml;q=0.9'}
      });
      if (reply.status >= 300 && reply.status < 400) return json({ok:false,error:'redirect_unsupported'},502);
      if (!reply.ok) return json({ok:false,error:'upstream_unavailable',status:reply.status},reply.status);
      const type = (reply.headers.get('content-type') || '').toLowerCase();
      if (!type.includes('text/html') && !type.includes('application/xhtml+xml')) {
        return json({ok:false,error:'non_html_upstream'},415);
      }
      if (Number(reply.headers.get('content-length') || 0) > MAX_HTML_BYTES) return json({ok:false,error:'too_large'},413);
      const reader = reply.body && reply.body.getReader ? reply.body.getReader() : null;
      if (!reader) return json({ok:false,error:'stream_unavailable'},502);
      const chunks = [];
      let total = 0;
      while (true) {
        const {done,value} = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_HTML_BYTES) { await reader.cancel(); return json({ok:false,error:'too_large'},413); }
        chunks.push(value);
      }
      const out = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {out.set(chunk, offset); offset+=chunk.length;}
      return new Response(out, {status:200, headers:{...CORS,'Content-Type':'text/html; charset=utf-8'}});
    } catch (_) {
      return json({ok:false,error:'upstream_network_failure'},502);
    }
  }
};
