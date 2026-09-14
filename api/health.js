// GET /api/health - simple liveness check for testing deployments.
const { ok, methodNotAllowed } = require('./_lib/respond');

module.exports = async function handler(req) {
  if (req.method === 'OPTIONS') return ok({}, 204);
  if (req.method !== 'GET') return methodNotAllowed(req, ['GET']);

  return ok({
    service: 'iyawo-xsto-backend',
    status: 'ok',
    time: new Date().toISOString()
  });
}