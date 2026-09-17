import axios from 'axios';

const getDevApiUrl = () => {
  const viteUrl = import.meta.env.VITE_API_URL;
  if (!viteUrl || viteUrl === '/api') {
    return 'http://localhost:4000/api';
  }
  return viteUrl;
};

const API_BASE_URL = import.meta.env.DEV
  ? getDevApiUrl()
  : (import.meta.env.VITE_API_URL || '/api');

console.log('🔧 [Axios] API Base URL:', API_BASE_URL);
console.log('🔧 [Axios] DEV mode:', import.meta.env.DEV);
console.log('🔧 [Axios] VITE_API_URL:', import.meta.env.VITE_API_URL);

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Intercepteur requête : ajouter le token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('amc_access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * Pour une requête `responseType: 'blob'` (téléchargement de fichier), une réponse
 * d'erreur JSON du serveur arrive quand même sous forme de Blob (axios respecte le
 * responseType demandé même en cas d'échec) — `error.response.data.code` est alors
 * `undefined` et le refresh de token ci-dessous ne se déclenche jamais. On relit le
 * Blob en JSON pour retrouver le code d'erreur dans ce cas.
 */
async function extractErrorCode(error) {
  const data = error.response?.data;
  if (data instanceof Blob) {
    try {
      const text = await data.text();
      return JSON.parse(text)?.code;
    } catch {
      return undefined;
    }
  }
  return data?.code;
}

// Intercepteur réponse : refresh token si 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const errorCode = error.response?.status === 401 ? await extractErrorCode(error) : undefined;

    if (error.response?.status === 401 && errorCode === 'TOKEN_EXPIRED' && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const refreshToken = localStorage.getItem('amc_refresh_token');
        if (!refreshToken) throw new Error('No refresh token');

        const { data } = await axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken });
        localStorage.setItem('amc_access_token', data.accessToken);
        localStorage.setItem('amc_refresh_token', data.refreshToken);
        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        localStorage.removeItem('amc_access_token');
        localStorage.removeItem('amc_refresh_token');
        localStorage.removeItem('amc_user');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
