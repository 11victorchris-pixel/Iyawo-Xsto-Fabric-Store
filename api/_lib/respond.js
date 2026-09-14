// Vercel Node serverless helpers (req, res) pattern.
// All handlers use: module.exports = async (req, res) => {...}
function setCors(req, res) {
  const origin = req.headers && req.headers.origin ? req.headers.origin : '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function json(res, data, status = 200) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

function ok(res, data, status = 200) {
  return json(res, { success: true, data }, status);
}

function fail(res, message, status = 400, extra = {}) {
  return json(res, Object.assign({ success: false, error: message }, extra), status);
}

// Vercel Node already parses JSON bodies into req.body when
// Content-Type is application/json. Fall back to manual parse.
async function readBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') {
      try { return req.body ? JSON.parse(req.body) : {}; } catch (err) { return {}; }
    }
    return req.body;
  }
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const text = Buffer.concat(chunks).toString('utf8');
    return text ? JSON.parse(text) : {};
  } catch (err) {
    return {};
  }
}

function methodNotAllowed(res, req, allowed) {
  return fail(res, `Method ${req.method} not allowed. Allowed: ${allowed.join(', ')}.`, 405);
}

// Vercel Node populates req.query automatically. Fall back to URL parsing.
function getQuery(req) {
  if (req.query && typeof req.query === 'object') return req.query;
  try {
    const url = new URL(req.url || '/', getOrigin(req));
    return Object.fromEntries(url.searchParams.entries());
  } catch (err) {
    return {};
  }
}

function getAuthHeader(req) {
  const h = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  return Array.isArray(h) ? h[0] : String(h);
}

function getIdParam(req) {
  if (req.query && (req.query.id || req.query.idOrSlug)) {
    return decodeURIComponent(String(req.query.id || req.query.idOrSlug));
  }
  const path = String(req.url || '').split('?')[0];
  return decodeURIComponent(path.split('/').filter(Boolean).pop() || '');
}

function getOrigin(req) {
  const proto = (req.headers && req.headers['x-forwarded-proto']) || 'https';
  const host = (req.headers && (req.headers['x-forwarded-host'] || req.headers.host)) || 'localhost';
  return `${proto}://${host}`;
}

function handleOptions(req, res) {
  if (req.method === 'OPTIONS') {
    setCors(req, res);
    res.statusCode = 204;
    res.end('');
    return true;
  }
  setCors(req, res);
  return false;
}

module.exports = { setCors, json, ok, fail, readBody, methodNotAllowed, getQuery, getAuthHeader, getIdParam, getOrigin, handleOptions };