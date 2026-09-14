const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: HEADERS
  });
}

function ok(data, status = 200) {
  return json({ success: true, data }, status);
}

function fail(message, status = 400, extra = {}) {
  return json(Object.assign({ success: false, error: message }, extra), status);
}

async function readBody(req) {
  try {
    const text = await req.text();
    return text ? JSON.parse(text) : {};
  } catch (err) {
    return {};
  }
}

function methodNotAllowed(req, allowed) {
  return fail(
    `Method ${req.method} not allowed. Allowed: ${allowed.join(', ')}.`,
    405
  );
}

module.exports = { json, ok, fail, readBody, methodNotAllowed };