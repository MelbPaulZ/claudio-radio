/**
 * Health probe used by Docker compose healthcheck and external monitors.
 * Intentionally trivial: does not query DB or external services.
 */
export function healthHandler(_req, res) {
  res.json({ ok: true, ts: Date.now() });
}
