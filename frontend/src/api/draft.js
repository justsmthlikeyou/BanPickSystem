import api from './auth'

export const draftApi = {
    // Characters
    getCharacters: () => api.get('/characters/'),

    // Sessions
    createSession: (season_id) =>
        api.post('/sessions/', { season_id }),

    getSession: (roomCode) => api.get(`/sessions/${roomCode}`),

    joinSession: (roomCode) => api.post(`/sessions/${roomCode}/join`),

    // Admin
    getActiveSeason: () => api.get('/admin/seasons/active'),

    listSessions: () => api.get('/admin/sessions'),

    deleteSession: (sessionId) => api.delete(`/sessions/${sessionId}`),

    createSeason: (name) => api.post('/admin/seasons', { name }),

    assignFreeChar: (season_id, character_id) =>
        api.post('/admin/seasons/free-characters', { season_id, character_id }),
}
