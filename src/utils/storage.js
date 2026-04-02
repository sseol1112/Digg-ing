const USERS_KEY = "digging_users_v1";
const SESSION_KEY = "digging_session_v1";
const POSTS_KEY = "digging_posts_v1";

export function readUsers() {
  const raw = localStorage.getItem(USERS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function writeUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

export function getSessionUserId() {
  return localStorage.getItem(SESSION_KEY);
}

export function setSessionUserId(userId) {
  localStorage.setItem(SESSION_KEY, userId);
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export function readPosts() {
  const raw = localStorage.getItem(POSTS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function writePosts(posts) {
  localStorage.setItem(POSTS_KEY, JSON.stringify(posts));
}
