/**
 * Owner-only inbox access via Cloudflare Access header or INBOX_API_TOKEN.
 */
export function inboxAuth(req, res, next) {
  const cfUser = req.headers['cf-access-authenticated-user-email'];
  if (cfUser) {
    req.inboxUser = cfUser;
    return next();
  }

  const token = process.env.INBOX_API_TOKEN;
  const headerToken = req.headers['x-inbox-token'];
  if (token && headerToken && headerToken === token) {
    req.inboxUser = 'token';
    return next();
  }

  return res.status(401).json({
    success: false,
    error: 'Unauthorized — Cloudflare Access or x-inbox-token required',
  });
}
