/** Build the server-side proxy from the single backend URL setting. */
function getApiRewrites(env = process.env) {
  const value = String(env.API_BASE_URL || '').trim();
  // An external reverse proxy (for example Nginx) may handle /api instead.
  if (!value) return [];
  let url;
  try { url = new URL(value); } catch { throw new Error('API_BASE_URL must be an HTTP(S) backend origin without /api'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash) {
    throw new Error('API_BASE_URL must be an HTTP(S) backend origin without /api');
  }
  return [{ source: '/api/:path*', destination: `${url.origin}/api/:path*` }];
}

module.exports = { getApiRewrites };
