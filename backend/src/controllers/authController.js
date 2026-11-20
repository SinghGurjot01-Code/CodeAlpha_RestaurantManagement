import { setSessionCookie, clearSessionCookie } from '../middleware/auth.js';

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export const login = asyncHandler(async (req, res) => {
  const { authService, config } = req.ctx;
  const { email, password } = req.body || {};
  const { user, token } = await authService.login({ email, password });
  setSessionCookie(res, token, config.sessionTtlHours);
  res.json({ user, token });
});

export const logout = asyncHandler(async (req, res) => {
  clearSessionCookie(res);
  res.json({ loggedOut: true });
});

export const me = asyncHandler(async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not signed in.', user: null });
  }
  res.json({ user: req.user });
});

export const listStaff = asyncHandler(async (req, res) => {
  const staff = await req.ctx.authService.listStaff();
  res.json({ staff });
});

export const createStaff = asyncHandler(async (req, res) => {
  const member = await req.ctx.authService.createStaff(req.user, req.body || {});
  res.status(201).json({ staffMember: member });
});

export const getSettings = asyncHandler(async (req, res) => {
  const settings = await req.ctx.authService.getSettings();
  res.json({ settings });
});

export const updateSettings = asyncHandler(async (req, res) => {
  const settings = await req.ctx.authService.updateSettings(req.user, req.body || {});
  res.json({ settings });
});
