const ACCESS_TOKEN_KEY = 'futuremode_access_token';

let memoryToken = null;

export function getAccessToken() {
  if (memoryToken) return memoryToken;
  try {
    memoryToken = sessionStorage.getItem(ACCESS_TOKEN_KEY);
  } catch (error) {}
  return memoryToken;
}

export function setAccessToken(token) {
  memoryToken = token || null;
  try {
    if (memoryToken) sessionStorage.setItem(ACCESS_TOKEN_KEY, memoryToken);
    else sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  } catch (error) {}
}

export function clearAccessToken() {
  setAccessToken(null);
}

