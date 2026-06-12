import { describe, expect, it } from 'vitest';
import {
  signSession,
  verifySession,
  parseCookies,
  getSessionFromReq,
  buildSessionCookie,
  clearSessionCookie,
  buildOrigin,
  SESSION_COOKIE,
} from '../lib/session.js';

const SECRET = 'unit-secret';

describe('session signing / verification', () => {
  it('round-trips a valid payload', () => {
    const exp = Date.now() + 60_000;
    const token = signSession({ email: 'a@b.com', exp }, SECRET);
    expect(verifySession(token, SECRET)).toEqual({ email: 'a@b.com', exp });
  });

  it('rejects a tampered signature', () => {
    const token = signSession({ email: 'a@b.com', exp: Date.now() + 60_000 }, SECRET);
    const [body] = token.split('.');
    expect(verifySession(`${body}.deadbeef`, SECRET)).toBeNull();
  });

  it('rejects a tampered payload (signature mismatch)', () => {
    const token = signSession({ email: 'a@b.com', exp: Date.now() + 60_000 }, SECRET);
    const sig = token.split('.')[1];
    const forgedBody = Buffer.from(JSON.stringify({ email: 'evil@b.com', exp: Date.now() + 60_000 }))
      .toString('base64url');
    expect(verifySession(`${forgedBody}.${sig}`, SECRET)).toBeNull();
  });

  it('rejects a different secret', () => {
    const token = signSession({ email: 'a@b.com', exp: Date.now() + 60_000 }, SECRET);
    expect(verifySession(token, 'other-secret')).toBeNull();
  });

  it('rejects an expired session', () => {
    const token = signSession({ email: 'a@b.com', exp: Date.now() - 1 }, SECRET);
    expect(verifySession(token, SECRET)).toBeNull();
  });

  it('rejects malformed tokens', () => {
    expect(verifySession('', SECRET)).toBeNull();
    expect(verifySession('nodot', SECRET)).toBeNull();
    expect(verifySession(null, SECRET)).toBeNull();
  });
});

describe('cookie parsing / serialization', () => {
  it('parses a cookie header', () => {
    expect(parseCookies('a=1; b=two; kimon_session=xyz')).toEqual({
      a: '1', b: 'two', kimon_session: 'xyz',
    });
    expect(parseCookies(undefined)).toEqual({});
  });

  it('extracts a session from req headers', () => {
    const token = signSession({ email: 'a@b.com', exp: Date.now() + 60_000 }, SECRET);
    const req = { headers: { cookie: `${SESSION_COOKIE}=${token}` } };
    expect(getSessionFromReq(req, SECRET)?.email).toBe('a@b.com');
    expect(getSessionFromReq({ headers: {} }, SECRET)).toBeNull();
  });

  it('builds HttpOnly/Secure/SameSite=Lax/Path=/ cookie and a clearing cookie', () => {
    const c = buildSessionCookie('VALUE');
    expect(c).toContain(`${SESSION_COOKIE}=VALUE`);
    expect(c).toContain('HttpOnly');
    expect(c).toContain('Secure');
    expect(c).toContain('SameSite=Lax');
    expect(c).toContain('Path=/');
    expect(c).toMatch(/Max-Age=\d+/);
    expect(clearSessionCookie()).toContain('Max-Age=0');
  });
});

describe('buildOrigin (案D: APP_BASE_URL > VERCEL_URL > host)', () => {
  const req = { headers: { host: 'preview-xyz.vercel.app', 'x-forwarded-proto': 'https' } };

  it('prefers APP_BASE_URL (本番のカスタムドメイン固定)', () => {
    expect(buildOrigin(req, { APP_BASE_URL: 'https://kimon.example.com/', VERCEL_URL: 'x.vercel.app' }))
      .toBe('https://kimon.example.com');
  });

  it('falls back to VERCEL_URL (Preview/本番ともenv由来・Host偽装不可)', () => {
    expect(buildOrigin(req, { VERCEL_URL: 'preview-xyz.vercel.app' }))
      .toBe('https://preview-xyz.vercel.app');
  });

  it('falls back to allowlisted Host header', () => {
    expect(buildOrigin(req, {})).toBe('https://preview-xyz.vercel.app');
  });

  it('rejects a non-allowlisted host', () => {
    const evil = { headers: { host: 'evil.attacker.com', 'x-forwarded-proto': 'https' } };
    expect(buildOrigin(evil, {})).toBeNull();
  });
});
