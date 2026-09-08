// Same-origin API paths. The Express API is mounted at /api by the custom
// server (see server.js), so these are relative and need no host or port.
const API_BASE = "/api";

export const API_ENDPOINT = {
  base: API_BASE,
  login: `${API_BASE}/user/login`,
  updateUser: `${API_BASE}/user/update`,
  logout: `${API_BASE}/user/logout`,
  me: `${API_BASE}/user/me`,
  register: `${API_BASE}/user/register`,
  todo: `${API_BASE}/todo`,
  trash: `${API_BASE}/trash`,
};
