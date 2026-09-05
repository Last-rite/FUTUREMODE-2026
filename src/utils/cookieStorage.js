const COOKIE_NAME = 'futuremode_auth';
const ONE_DAY_SECONDS = 86400; // 24 hours in seconds

/**
 * Decode standard Google JWT credential token (UTF-8 safe)
 */
export function decodeJwt(token) {
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (err) {
    console.error('Failed to decode Google JWT token:', err);
    return null;
  }
}

/**
 * Store user session in browser cookie with 1-day (86400s) expiration
 */
export function setAuthCookie(userData) {
  try {
    const serialized = encodeURIComponent(JSON.stringify(userData));
    // Set 1-day cookie
    document.cookie = `${COOKIE_NAME}=${serialized}; max-age=${ONE_DAY_SECONDS}; path=/; SameSite=Lax`;
    
    // Also mirror to localStorage with timestamp as backup
    const backupData = {
      ...userData,
      _expiresAt: Date.now() + ONE_DAY_SECONDS * 1000,
    };
    localStorage.setItem(COOKIE_NAME, JSON.stringify(backupData));
  } catch (err) {
    console.error('Failed to set auth cookie:', err);
  }
}

/**
 * Retrieve active user session from cookie (or non-expired localStorage mirror)
 */
export function getAuthCookie() {
  try {
    // 1. Try reading standard document.cookie
    const match = document.cookie
      .split('; ')
      .find((row) => row.startsWith(`${COOKIE_NAME}=`));
      
    if (match) {
      const value = match.split('=')[1];
      if (value) {
        return JSON.parse(decodeURIComponent(value));
      }
    }

    // 2. Fallback check in localStorage if cookies are restricted in current browser environment
    const localRaw = localStorage.getItem(COOKIE_NAME);
    if (localRaw) {
      const localData = JSON.parse(localRaw);
      if (localData._expiresAt && Date.now() < localData._expiresAt) {
        return localData;
      } else {
        // Expired
        localStorage.removeItem(COOKIE_NAME);
      }
    }
  } catch (err) {
    console.error('Failed to read auth cookie:', err);
  }
  return null;
}

/**
 * Clear the cookie and remove active session (Sign Out)
 */
export function clearAuthCookie() {
  try {
    document.cookie = `${COOKIE_NAME}=; max-age=0; path=/; SameSite=Lax`;
    localStorage.removeItem(COOKIE_NAME);
  } catch (err) {
    console.error('Failed to clear auth cookie:', err);
  }
}
