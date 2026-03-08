import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { authApi } from '../api/auth'
import { draftApi } from '../api/draft'

/* ═══════════════════════════════════════════════════════════════════════════
   LobbyPage — Premium Esports Dashboard
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── Inline SVG Icons (no external dependency) ───────────────────────────── */
const EyeIcon = ({ size = 14, className = '' }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        className={className}>
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
    </svg>
)

const TrashIcon = ({ size = 14, className = '' }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        className={className}>
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        <line x1="10" y1="11" x2="10" y2="17" />
        <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
)

const DoorIcon = ({ size = 14, className = '' }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        className={className}>
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
)

/* ── Status color map ─────────────────────────────────────────────────────── */
const STATUS_STYLE = {
    waiting: { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.18)', color: '#fbbf24', label: 'Waiting' },
    coin_toss: { bg: 'rgba(234,179,8,0.08)', border: 'rgba(234,179,8,0.18)', color: '#facc15', label: 'Coin Toss' },
    ban_phase_1: { bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.18)', color: '#f87171', label: 'Ban 1' },
    pick_phase_1: { bg: 'rgba(99,102,241,0.08)', border: 'rgba(99,102,241,0.18)', color: '#a5b4fc', label: 'Pick 1' },
    ban_phase_2: { bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.18)', color: '#f87171', label: 'Ban 2' },
    pick_phase_2: { bg: 'rgba(99,102,241,0.08)', border: 'rgba(99,102,241,0.18)', color: '#a5b4fc', label: 'Pick 2' },
    team_building: { bg: 'rgba(168,85,247,0.08)', border: 'rgba(168,85,247,0.18)', color: '#c4b5fd', label: 'Building' },
}
const DEFAULT_STATUS = { bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.06)', color: '#52525b', label: '—' }

function timeAgo(dateStr) {
    const diff = Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000))
    if (diff < 60) return `${diff}s ago`
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    return `${Math.floor(diff / 3600)}h ago`
}

export default function LobbyPage() {
    const navigate = useNavigate()
    const username = localStorage.getItem('username')
    const [isAdmin, setIsAdmin] = useState(false)

    const [joinCode, setJoinCode] = useState('')
    const [myUserId, setMyUserId] = useState(null)
    const [joinLoading, setJoinLoading] = useState(false)
    const [createLoading, setCreateLoading] = useState(false)
    const [joinError, setJoinError] = useState(null)
    const [createError, setCreateError] = useState(null)

    // Live sessions (admin only)
    const [liveSessions, setLiveSessions] = useState([])
    const [sessionsLoading, setSessionsLoading] = useState(false)
    const [deletingId, setDeletingId] = useState(null)
    const refreshTimer = useRef(null)

    useEffect(() => {
        authApi.me().then(({ data }) => {
            setMyUserId(data.id)
            if (data.role === 'admin') {
                setIsAdmin(true)
                localStorage.setItem('role', 'admin')
            }
        }).catch(() => { })
    }, [])

    // ── Fetch live sessions (admin) ──────────────────────────────────────────
    const fetchSessions = async () => {
        try {
            setSessionsLoading(true)
            const { data } = await draftApi.listSessions()
            setLiveSessions(data)
        } catch { /* silent */ } finally {
            setSessionsLoading(false)
        }
    }

    useEffect(() => {
        if (!isAdmin) return
        fetchSessions()
        refreshTimer.current = setInterval(fetchSessions, 10000)
        return () => clearInterval(refreshTimer.current)
    }, [isAdmin])

    // ── Handlers ─────────────────────────────────────────────────────────────
    const handleJoin = async (codeOverride) => {
        const code = (codeOverride || joinCode).trim().toUpperCase()
        if (!code) return
        setJoinError(null)
        setJoinLoading(true)
        try {
            // First, get current session state
            const { data: sess } = await draftApi.getSession(code)
            let myRole

            if (isAdmin) {
                // Admin always spectates
                myRole = 'admin'
            } else if (sess.player_a_id === myUserId) {
                // Already player_a
                myRole = 'player_a'
            } else if (sess.player_b_id === myUserId) {
                // Already player_b
                myRole = 'player_b'
            } else if (!sess.player_a_id || !sess.player_b_id) {
                // Open slot — join and get updated session
                const { data: joined } = await draftApi.joinSession(code)
                myRole = joined.player_a_id === myUserId ? 'player_a' : 'player_b'
            } else {
                throw new Error('This session is already full.')
            }

            localStorage.setItem('role', myRole)
            navigate(`/room/${code}`)
        } catch (err) {
            const detail = err.response?.data?.detail ?? err.message ?? 'Failed to join.'
            setJoinError(typeof detail === 'string' ? detail : JSON.stringify(detail))
        } finally {
            setJoinLoading(false)
        }
    }

    const handleCreate = async () => {
        setCreateError(null)
        setCreateLoading(true)
        try {
            const { data: season } = await draftApi.getActiveSeason()
            const { data: sess } = await draftApi.createSession(season.id)
            localStorage.setItem('role', 'admin')
            navigate(`/room/${sess.room_code}`)
        } catch (err) {
            const detail = err.response?.data?.detail ?? 'Failed to create session.'
            setCreateError(typeof detail === 'string' ? detail : JSON.stringify(detail))
        } finally {
            setCreateLoading(false)
        }
    }

    const handleDeleteRoom = async (roomId) => {
        if (!window.confirm('Delete this session? This cannot be undone.')) return
        setDeletingId(roomId)
        try {
            await draftApi.deleteSession(roomId)
            setLiveSessions((prev) => prev.filter((s) => s.id !== roomId))
        } catch { /* silent */ } finally {
            setDeletingId(null)
        }
    }

    const handleSpectate = (roomCode) => {
        localStorage.setItem('role', 'admin')
        navigate(`/room/${roomCode}`)
    }

    const logout = () => { authApi.logout(); navigate('/login') }

    /* ── Shared inline input style ──────────────────────────────────────────── */
    const inputStyle = {
        padding: '18px 22px',
        background: '#111318',
        border: '1px solid rgba(255,255,255,0.06)',
    }
    const inputFocus = (e) => {
        e.target.style.borderColor = 'rgba(99,102,241,0.5)'
        e.target.style.boxShadow = '0 0 0 4px rgba(99,102,241,0.08)'
    }
    const inputBlur = (e) => {
        e.target.style.borderColor = 'rgba(255,255,255,0.06)'
        e.target.style.boxShadow = 'none'
    }

    /* ── Render ────────────────────────────────────────────────────────────── */
    return (
        <div className="h-screen w-screen flex overflow-hidden" style={{ background: '#08090d' }}>

            {/* ── LEFT COLUMN: Content ────────────────────────────────────────── */}
            <div className="w-full lg:w-1/2 h-full flex flex-col overflow-y-auto"
                style={{ padding: 'clamp(2rem, 5vw, 5rem) clamp(2rem, 6vw, 7rem)' }}>

                <motion.div
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                    className="w-full max-w-lg mx-auto flex flex-col flex-1"
                >
                    {/* Top bar */}
                    <div className="flex items-center justify-between mb-14">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                                style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.15)' }}>
                                <span className="text-xl">⚔️</span>
                            </div>
                            <p className="font-bold text-indigo-400 text-sm tracking-[0.15em] uppercase leading-none">
                                Genshin Draft
                            </p>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-xs font-bold tracking-widest uppercase rounded-xl"
                                style={{
                                    padding: '6px 14px',
                                    background: 'rgba(99,102,241,0.08)',
                                    border: '1px solid rgba(99,102,241,0.12)',
                                    color: '#a5b4fc',
                                }}>
                                {isAdmin ? 'ADMIN' : 'PLAYER'}
                            </span>
                            <button
                                onClick={logout}
                                className="flex items-center gap-1.5 text-zinc-600 hover:text-zinc-400 transition-colors text-sm font-semibold cursor-pointer"
                                style={{ background: 'none', border: 'none', padding: '6px 10px' }}
                            >
                                <DoorIcon size={13} /> Logout
                            </button>
                        </div>
                    </div>

                    {/* Headline */}
                    <div className="mb-12">
                        <p className="text-indigo-400 text-xs font-bold tracking-[0.2em] uppercase mb-3">
                            Match Lobby
                        </p>
                        <h1 className="text-4xl lg:text-5xl font-bold text-white tracking-tight mb-3"
                            style={{ fontFamily: 'Rajdhani, sans-serif', lineHeight: 1.1 }}>
                            {isAdmin ? 'Manage Session' : 'Join Your Match'}
                        </h1>
                        <p className="text-zinc-500 text-base leading-relaxed max-w-sm">
                            {isAdmin
                                ? 'Create a new draft room or spectate an existing session.'
                                : 'Enter the room code provided by the match administrator.'}
                        </p>
                    </div>

                    {/* ── Admin: One-Click Create Room ─────────────────────────────── */}
                    {isAdmin && (
                        <div className="mb-10">
                            <div className="flex items-center gap-4 mb-7">
                                <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.05)' }} />
                                <span className="text-zinc-600 text-[11px] font-bold tracking-[0.2em] uppercase">
                                    Create Room
                                </span>
                                <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.05)' }} />
                            </div>

                            <div className="flex flex-col gap-5">
                                {/* Info badge */}
                                <div className="flex items-center gap-3 rounded-2xl"
                                    style={{ padding: '14px 18px', background: '#111318', border: '1px solid rgba(255,255,255,0.04)' }}>
                                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-indigo-400"
                                        style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.15)' }}>
                                        ⚡
                                    </div>
                                    <div>
                                        <p className="text-xs text-zinc-400 font-semibold">One-Click Room</p>
                                        <p className="text-[10px] text-zinc-600">Players join via room code. No IDs needed.</p>
                                    </div>
                                </div>

                                <AnimatePresence>
                                    {createError && (
                                        <motion.p
                                            initial={{ opacity: 0, y: -4 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0 }}
                                            className="rounded-2xl text-sm font-medium"
                                            style={{
                                                padding: '14px 18px',
                                                background: 'rgba(239,68,68,0.06)',
                                                border: '1px solid rgba(239,68,68,0.15)',
                                                color: '#fca5a5',
                                            }}
                                        >
                                            {createError}
                                        </motion.p>
                                    )}
                                </AnimatePresence>

                                <motion.button
                                    type="button"
                                    onClick={handleCreate}
                                    disabled={createLoading}
                                    whileHover={!createLoading ? { scale: 1.015 } : {}}
                                    whileTap={!createLoading ? { scale: 0.985 } : {}}
                                    className="w-full rounded-2xl text-white font-bold transition-all duration-300"
                                    style={{
                                        padding: '18px',
                                        fontSize: '15px',
                                        fontFamily: 'Rajdhani, sans-serif',
                                        letterSpacing: '0.06em',
                                        background: createLoading ? '#1e1e2e' : '#6366f1',
                                        border: 'none',
                                        cursor: createLoading ? 'not-allowed' : 'pointer',
                                        opacity: createLoading ? 0.6 : 1,
                                        boxShadow: createLoading ? 'none' : '0 4px 20px -4px rgba(99,102,241,0.4)',
                                    }}
                                >
                                    {createLoading ? 'Creating…' : 'CREATE & ENTER ROOM'}
                                </motion.button>
                            </div>
                        </div>
                    )}

                    {/* ── Join Room (both admin + player) ─────────────────────────── */}
                    <div className="mb-10">
                        {isAdmin && (
                            <div className="flex items-center gap-4 mb-7">
                                <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.05)' }} />
                                <span className="text-zinc-600 text-[11px] font-bold tracking-[0.2em] uppercase">
                                    Or Enter a Room Code
                                </span>
                                <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.05)' }} />
                            </div>
                        )}

                        <div className="flex flex-col gap-6">
                            <fieldset className="flex flex-col gap-2.5">
                                {!isAdmin && (
                                    <label className="text-xs font-bold text-zinc-500 tracking-[0.15em] uppercase pl-1">
                                        Room Code
                                    </label>
                                )}
                                <input
                                    type="text"
                                    value={joinCode}
                                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                                    placeholder="XXXXXXXX"
                                    className="w-full rounded-2xl text-[16px] text-white outline-none transition-all duration-200 placeholder-zinc-700 tracking-[0.2em] font-mono"
                                    style={inputStyle}
                                    onFocus={inputFocus}
                                    onBlur={inputBlur}
                                />
                            </fieldset>

                            <AnimatePresence>
                                {joinError && (
                                    <motion.p
                                        initial={{ opacity: 0, y: -4 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0 }}
                                        className="rounded-2xl text-sm font-medium"
                                        style={{
                                            padding: '14px 18px',
                                            background: 'rgba(239,68,68,0.06)',
                                            border: '1px solid rgba(239,68,68,0.15)',
                                            color: '#fca5a5',
                                        }}
                                    >
                                        {joinError}
                                    </motion.p>
                                )}
                            </AnimatePresence>

                            <motion.button
                                type="button"
                                onClick={() => handleJoin()}
                                disabled={joinLoading}
                                whileHover={!joinLoading ? { scale: 1.015 } : {}}
                                whileTap={!joinLoading ? { scale: 0.985 } : {}}
                                className="w-full rounded-2xl font-bold transition-all duration-300"
                                style={{
                                    padding: '18px',
                                    fontSize: '15px',
                                    fontFamily: 'Rajdhani, sans-serif',
                                    letterSpacing: '0.06em',
                                    background: isAdmin ? 'rgba(99,102,241,0.08)' : '#6366f1',
                                    border: isAdmin ? '1px solid rgba(99,102,241,0.15)' : 'none',
                                    color: isAdmin ? '#a5b4fc' : 'white',
                                    cursor: joinLoading ? 'not-allowed' : 'pointer',
                                    opacity: joinLoading ? 0.6 : 1,
                                    boxShadow: isAdmin ? 'none' : '0 4px 20px -4px rgba(99,102,241,0.4)',
                                }}
                            >
                                {joinLoading ? 'Connecting…' : 'ENTER ROOM'}
                            </motion.button>
                        </div>
                    </div>

                    {/* ── Admin: Live Sessions Dashboard ─────────────────────────── */}
                    {isAdmin && (
                        <div className="mt-2">
                            <div className="flex items-center gap-4 mb-5">
                                <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.05)' }} />
                                <span className="text-zinc-600 text-[11px] font-bold tracking-[0.2em] uppercase">
                                    Live Sessions
                                </span>
                                <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.05)' }} />
                            </div>

                            {sessionsLoading && liveSessions.length === 0 ? (
                                <div className="rounded-2xl p-8 text-center"
                                    style={{ background: '#111318', border: '1px solid rgba(255,255,255,0.03)' }}>
                                    <p className="text-zinc-600 text-sm animate-pulse">Loading sessions…</p>
                                </div>
                            ) : liveSessions.length === 0 ? (
                                <div className="rounded-2xl p-8 text-center"
                                    style={{ background: '#111318', border: '1px solid rgba(255,255,255,0.03)' }}>
                                    <p className="text-zinc-700 text-2xl mb-2">📭</p>
                                    <p className="text-zinc-600 text-sm font-medium">No active sessions</p>
                                    <p className="text-zinc-700 text-xs mt-1">Create a room above to get started.</p>
                                </div>
                            ) : (
                                /* ── Session Table ─────────────────────────────────── */
                                <div className="rounded-2xl overflow-hidden"
                                    style={{ background: '#111318', border: '1px solid rgba(255,255,255,0.04)' }}>

                                    {/* Table header */}
                                    <div className="grid gap-3 px-5 py-3"
                                        style={{
                                            gridTemplateColumns: '1fr auto auto auto',
                                            borderBottom: '1px solid rgba(255,255,255,0.04)',
                                        }}>
                                        <span className="text-[10px] font-bold text-zinc-600 tracking-[0.15em] uppercase">Room</span>
                                        <span className="text-[10px] font-bold text-zinc-600 tracking-[0.15em] uppercase text-center">Players</span>
                                        <span className="text-[10px] font-bold text-zinc-600 tracking-[0.15em] uppercase text-center">Status</span>
                                        <span className="text-[10px] font-bold text-zinc-600 tracking-[0.15em] uppercase text-right">Actions</span>
                                    </div>

                                    {/* Table rows */}
                                    <AnimatePresence>
                                        {liveSessions.map((sess, i) => {
                                            const st = STATUS_STYLE[sess.status] || DEFAULT_STATUS
                                            const pa = sess.player_a_id ? 1 : 0
                                            const pb = sess.player_b_id ? 1 : 0
                                            const playerCount = pa + pb
                                            const isDeleting = deletingId === sess.id
                                            return (
                                                <motion.div
                                                    key={sess.id}
                                                    layout
                                                    initial={{ opacity: 0 }}
                                                    animate={{ opacity: isDeleting ? 0.3 : 1 }}
                                                    exit={{ opacity: 0, height: 0 }}
                                                    transition={{ duration: 0.2 }}
                                                    className="grid gap-3 items-center px-5 py-3 transition-colors duration-150"
                                                    style={{
                                                        gridTemplateColumns: '1fr auto auto auto',
                                                        borderBottom: i < liveSessions.length - 1
                                                            ? '1px solid rgba(255,255,255,0.03)'
                                                            : 'none',
                                                        cursor: 'default',
                                                    }}
                                                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                                                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                                >
                                                    {/* Room code + age */}
                                                    <div className="flex items-center gap-2.5">
                                                        <span className="font-bold tracking-[0.2em] text-sm text-indigo-400"
                                                            style={{ fontFamily: 'Share Tech Mono, monospace' }}>
                                                            {sess.room_code}
                                                        </span>
                                                        <span className="text-[10px] text-zinc-700">{timeAgo(sess.created_at)}</span>
                                                    </div>

                                                    {/* Player count dots */}
                                                    <div className="flex items-center gap-2 justify-center">
                                                        <div className="flex gap-1">
                                                            <div className="w-2 h-2 rounded-full transition-colors"
                                                                style={{ background: pa ? '#22c55e' : '#27272a' }} />
                                                            <div className="w-2 h-2 rounded-full transition-colors"
                                                                style={{ background: pb ? '#22c55e' : '#27272a' }} />
                                                        </div>
                                                        <span className="text-[11px] text-zinc-600 font-medium">{playerCount}/2</span>
                                                    </div>

                                                    {/* Status badge */}
                                                    <div className="flex justify-center">
                                                        <span className="text-[10px] font-bold tracking-wider uppercase rounded-md"
                                                            style={{
                                                                padding: '3px 8px',
                                                                background: st.bg,
                                                                border: `1px solid ${st.border}`,
                                                                color: st.color,
                                                            }}>
                                                            {st.label}
                                                        </span>
                                                    </div>

                                                    {/* Actions */}
                                                    <div className="flex items-center gap-1.5 justify-end">
                                                        <button
                                                            onClick={() => handleSpectate(sess.room_code)}
                                                            title="Spectate this room"
                                                            className="flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200"
                                                            style={{
                                                                background: 'transparent',
                                                                border: '1px solid rgba(99,102,241,0.1)',
                                                                color: '#6366f1',
                                                                cursor: 'pointer',
                                                            }}
                                                            onMouseEnter={(e) => {
                                                                e.currentTarget.style.background = 'rgba(99,102,241,0.1)'
                                                                e.currentTarget.style.borderColor = 'rgba(99,102,241,0.25)'
                                                            }}
                                                            onMouseLeave={(e) => {
                                                                e.currentTarget.style.background = 'transparent'
                                                                e.currentTarget.style.borderColor = 'rgba(99,102,241,0.1)'
                                                            }}
                                                        >
                                                            <EyeIcon size={14} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteRoom(sess.id)}
                                                            disabled={isDeleting}
                                                            title="Delete this session"
                                                            className="flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200"
                                                            style={{
                                                                background: 'transparent',
                                                                border: '1px solid rgba(239,68,68,0.08)',
                                                                color: '#52525b',
                                                                cursor: isDeleting ? 'not-allowed' : 'pointer',
                                                            }}
                                                            onMouseEnter={(e) => {
                                                                e.currentTarget.style.background = 'rgba(239,68,68,0.08)'
                                                                e.currentTarget.style.borderColor = 'rgba(239,68,68,0.2)'
                                                                e.currentTarget.style.color = '#ef4444'
                                                            }}
                                                            onMouseLeave={(e) => {
                                                                e.currentTarget.style.background = 'transparent'
                                                                e.currentTarget.style.borderColor = 'rgba(239,68,68,0.08)'
                                                                e.currentTarget.style.color = '#52525b'
                                                            }}
                                                        >
                                                            <TrashIcon size={14} />
                                                        </button>
                                                    </div>
                                                </motion.div>
                                            )
                                        })}
                                    </AnimatePresence>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Footer spacer */}
                    <div className="mt-auto pt-12">
                        <div className="flex items-center justify-between text-zinc-700 text-xs tracking-widest uppercase font-bold">
                            <span>Logged in as <span className="text-zinc-500">{username}</span></span>
                            <span>v2.0</span>
                        </div>
                    </div>
                </motion.div>
            </div>

            {/* ── RIGHT COLUMN: Graphic ───────────────────────────────────────── */}
            <div className="hidden lg:block lg:w-1/2 h-full relative overflow-hidden">
                <img
                    src="https://images8.alphacoders.com/135/thumb-1920-1353872.jpeg"
                    alt="Esports Arena"
                    className="absolute inset-0 w-full h-full object-cover"
                    style={{ opacity: 0.55 }}
                />
                <div className="absolute inset-0 pointer-events-none"
                    style={{ background: 'linear-gradient(to right, #08090d 0%, rgba(8,9,13,0.7) 25%, transparent 60%)' }} />
                <div className="absolute inset-0 pointer-events-none"
                    style={{ background: 'linear-gradient(to top, #08090d 0%, transparent 40%)' }} />
                <div className="absolute inset-0 pointer-events-none"
                    style={{ background: 'linear-gradient(to bottom, rgba(8,9,13,0.4) 0%, transparent 30%)' }} />

                <div className="absolute bottom-12 right-12 z-10 text-right">
                    <p className="text-white/25 text-xs font-bold tracking-[0.25em] uppercase">
                        Spiral Abyss Tournament
                    </p>
                </div>
            </div>
        </div>
    )
}
