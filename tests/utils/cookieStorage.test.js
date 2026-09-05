import { describe, it, expect, beforeEach } from 'vitest';
import {
  decodeJwt,
  setAuthCookie,
  getAuthCookie,
  clearAuthCookie,
} from '../../src/utils/cookieStorage.js';

describe('Cookie and Session Storage Utilities', () => {
  beforeEach(() => {
    // Clear cookies and localStorage
    document.cookie = 'futuremode_auth=; max-age=0; path=/;';
    localStorage.clear();
  });

  it('decodeJwt: correctly decodes a standard base64/base64url JWT payload', () => {
    // Header: {"alg":"HS256","typ":"JWT"} -> eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9
    // Payload: {"sub":"1234567890","name":"Nox Tester","iat":1516239022}
    const payloadObj = { sub: '1234567890', name: 'Nox Tester', iat: 1516239022 };
    const base64Payload = btoa(JSON.stringify(payloadObj));
    const token = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${base64Payload}.signature`;

    const decoded = decodeJwt(token);
    expect(decoded).toEqual(payloadObj);
  });

  it('decodeJwt: safely returns null on malformed token', () => {
    expect(decodeJwt('not-a-valid-token')).toBeNull();
    expect(decodeJwt('')).toBeNull();
  });

  it('setAuthCookie & getAuthCookie: saves and retrieves user session from cookie', () => {
    const user = { id: 'player-test', username: 'tester', displayName: '測試者' };
    setAuthCookie(user);

    const retrieved = getAuthCookie();
    expect(retrieved).toBeDefined();
    expect(retrieved.id).toBe('player-test');
    expect(retrieved.username).toBe('tester');
    expect(retrieved.displayName).toBe('測試者');
  });

  it('getAuthCookie: falls back to localStorage if document.cookie is empty', () => {
    const user = { id: 'local-user', username: 'local_player' };
    setAuthCookie(user);

    // Clear only document.cookie to test fallback
    document.cookie = 'futuremode_auth=; max-age=0; path=/;';

    const fallback = getAuthCookie();
    expect(fallback).toBeDefined();
    expect(fallback.id).toBe('local-user');
  });

  it('clearAuthCookie: successfully cleans up both cookie and localStorage mirror', () => {
    const user = { id: 'player-1', username: 'p1' };
    setAuthCookie(user);
    expect(getAuthCookie()).not.toBeNull();

    clearAuthCookie();
    expect(getAuthCookie()).toBeNull();
  });
});
