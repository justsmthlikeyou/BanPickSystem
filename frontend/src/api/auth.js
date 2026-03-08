import axios from 'axios'

// Base axios instance. Vite proxy forwards /api → http://localhost:8000 in dev
// In production, uses the absolute VITE_API_URL.
const API_BASE_URL = import.meta.env.VITE_API_URL || '';
const api = axios.create({
    baseURL: API_BASE_URL ? `${API_BASE_URL}/api/v1` : '/api/v1',
    headers: { 'Content-Type': 'application/json' },
})

// Attach JWT from localStorage on every request
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token')
    if (token) config.headers.Authorization = `Bearer ${token}`
    return config
})

// Handle 401 — expired/invalid token → force logout
api.interceptors.response.use(
    (res) => res,
    (err) => {
        if (err.response?.status === 401 && !err.config?.url?.includes('/auth/login')) {
            localStorage.removeItem('token')
            localStorage.removeItem('role')
            localStorage.removeItem('username')
            window.location.href = '/login'
        }
        return Promise.reject(err)
    },
)

export const authApi = {
    register: (username, password, role = 'player') =>
        api.post('/auth/register', { username, password, role }),

    login: async (username, password) => {
        const res = await api.post('/auth/login', { username, password })
        const { access_token } = res.data
        localStorage.setItem('token', access_token)
        return res.data
    },

    me: () => api.get('/auth/me'),

    logout: () => {
        localStorage.removeItem('token')
        localStorage.removeItem('role')
        localStorage.removeItem('username')
    },
}

export default api
