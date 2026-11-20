import test from 'node:test';
import assert from 'node:assert';
import { hashPassword, verifyPassword, signToken, verifyToken } from '../src/utils/crypto.js';
import { isValidEmail, cleanText } from '../src/utils/validators.js';

test('hashPassword and verifyPassword securely hash and verify passwords', () => {
  const hash = hashPassword('admin123');
  assert.ok(hash.startsWith('scrypt:'));
  assert.equal(verifyPassword('admin123', hash), true);
  assert.equal(verifyPassword('wrongpass', hash), false);
});

test('signToken and verifyToken validate HMAC-SHA256 tokens', () => {
  const secret = 'dinehub-unit-test-secret-key-32-chars';
  const token = signToken({ sub: 1, email: 'admin@dinehub.com', role: 'Admin' }, secret, 24);
  const payload = verifyToken(token, secret);
  assert.equal(payload.sub, 1);
  assert.equal(payload.role, 'Admin');
  assert.equal(verifyToken(token, 'wrong-secret'), null);
  assert.equal(verifyToken(token + 'x', secret), null);
});

test('validators verify emails and sanitize text', () => {
  assert.equal(isValidEmail('admin@dinehub.com'), true);
  assert.equal(isValidEmail('invalid-email'), false);
  assert.equal(cleanText('  Margherita Pizza  ', 50), 'Margherita Pizza');
});
