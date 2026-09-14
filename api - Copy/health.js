// GET /api/health - simple liveness check for testing deployments.
const { ok, methodNotAllowed, handleOptions } = require('./_lib/respond');

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'GET') return methodNotAllowed(res, req, ['GET']);

  return ok(res, {
    service: 'iyawo-xsto-backend',
    status: 'ok',
    time: new Date().toISOString()
  });
};
