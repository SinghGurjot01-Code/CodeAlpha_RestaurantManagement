export const COOKIE_NAME = 'dh_token';

function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader || typeof cookieHeader !== 'string') return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

export function extractToken(req) {
  const auth = req.headers.authorization || '';
  if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }
  const cookies = parseCookies(req.headers.cookie);
  return cookies[COOKIE_NAME] || null;
}

export const optionalAuth = async (req, res, next) => {
  try {
    const token = extractToken(req);
    req.user = token ? await req.ctx.authService.authenticateToken(token) : null;
    next();
  } catch (err) {
    next(err);
  }
};

export const requireAuth = async (req, res, next) => {
  try {
    const token = extractToken(req);
    const user = token ? await req.ctx.authService.authenticateToken(token) : null;
    if (!user) {
      return res.status(401).json({ error: 'Staff authentication required. Please log in.' });
    }
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};

export const requireRole = (...allowedRoles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Staff authentication required. Please log in.' });
  }
  if (allowedRoles.length && !allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ error: `Insufficient permissions. Required role: ${allowedRoles.join(' or ')}.` });
  }
  next();
};

export function setSessionCookie(res, token, ttlHours = 168) {
  const maxAge = Math.max(1, Number(ttlHours) || 168) * 3600;
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`
  );
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}
