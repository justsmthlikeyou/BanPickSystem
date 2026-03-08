import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { draftApi } from '../api/draft'
import { useWebSocket } from '../hooks/useWebSocket'
import useDraftStore, { PHASE_LABELS, ACTIVE_DRAFT_PHASES, computeTeams } from '../store/draftStore'
import PrimaryButton from '../components/ui/PrimaryButton'
import { CasterTeamColumn, CasterSpotlight, CompleteSummary } from '../components/CasterComponents'
import { useAudioManager } from '../hooks/useAudioManager'
import AudioController from '../components/AudioController'

/* ═══════════════════════════════════════════════════════════════════════════
   DraftRoomPage — Premium Esports Ban/Pick Room + Admin/Caster Mode
   Conditional Layout: Centered for waiting/coin_toss, 55/45 split for draft
   ═══════════════════════════════════════════════════════════════════════════ */

// Layout mode derived from phase
const CENTERED_PHASES = new Set(['waiting', 'coin_toss'])

export default function DraftRoomPage() {
    const { code } = useParams()
    const navigate = useNavigate()

    // ── Store ────────────────────────────────────────────────────────────────
    const session = useDraftStore((s) => s.session)
    const phase = useDraftStore((s) => s.phase)
    const draftSlots = useDraftStore((s) => s.draftSlots)
    const characters = useDraftStore((s) => s.characters)
    const charMap = useDraftStore((s) => s.charMap)
    const selectedCharId = useDraftStore((s) => s.selectedCharId)
    const myRole = useDraftStore((s) => s.myRole)
    const phaseTransitionLabel = useDraftStore((s) => s.phaseTransitionLabel)
    const finalTeams = useDraftStore((s) => s.finalTeams)
    const isPaused = useDraftStore((s) => s.isPaused)
    const hoverPreview = useDraftStore((s) => s.hoverPreview)
    const selectedPreview = useDraftStore((s) => s.selectedPreview)
    const coinTossWinner = useDraftStore((s) => s.coinTossWinner)
    const wsStatus = useDraftStore((s) => s.wsStatus)

    const setCharacters = useDraftStore((s) => s.setCharacters)
    const setSelectedChar = useDraftStore((s) => s.setSelectedChar)
    const sendEvent = useDraftStore((s) => s.sendEvent)
    const currentSlot = useDraftStore((s) => s.currentSlot)
    const disconnectWs = useDraftStore((s) => s.disconnectWs)

    // ── Local UI state ───────────────────────────────────────────────────────
    const [adminPanelOpen, setAdminPanelOpen] = useState(false)
    const [lastLockedChar, setLastLockedChar] = useState(null)
    const [coinFlipAnim, setCoinFlipAnim] = useState('spinning') // 'spinning' | 'landed'
    const [searchQuery, setSearchQuery] = useState('')
    const hoverTimerRef = useRef(null)

    // ── Audio ────────────────────────────────────────────────────────────────
    const { isMuted, masterVolume, toggleMute, handleVolumeChange } = useAudioManager()

    // Ensure store knows the latest role from local storage if navigating directly
    useEffect(() => {
        const storedRole = localStorage.getItem('role')
        if (storedRole && storedRole !== myRole) {
            useDraftStore.setState({ myRole: storedRole })
        }
    }, [myRole])

    const activeRole = myRole || localStorage.getItem('role')
    const isAdmin = activeRole === 'admin'
    const isPlayer = activeRole === 'player_a' || activeRole === 'player_b'
    const isCentered = CENTERED_PHASES.has(phase)

    // ── WebSocket ────────────────────────────────────────────────────────────
    useWebSocket(code, activeRole)

    // ── Fetch characters on mount ────────────────────────────────────────────
    useEffect(() => {
        draftApi.getCharacters()
            .then(({ data }) => setCharacters(data))
            .catch((err) => console.error('Failed to load characters:', err))
    }, [setCharacters])

    // ── Coin toss animation: when winner is set, transition the coin ─────────
    useEffect(() => {
        if (phase === 'coin_toss' && coinTossWinner) {
            // Short delay before showing "landed" state
            const t = setTimeout(() => setCoinFlipAnim('landed'), 1200)
            return () => clearTimeout(t)
        }
        if (phase !== 'coin_toss') setCoinFlipAnim('spinning')
    }, [phase, coinTossWinner])

    // ── Track last action ────────────────────────────────────────────────────
    const draftActions = session?.draft_actions || []
    const lastAction = draftActions.length > 0 ? draftActions[draftActions.length - 1] : null

    // ── Derived state ────────────────────────────────────────────────────────
    const curSlot = currentSlot()
    const isActiveDraft = ACTIVE_DRAFT_PHASES.has(phase)
    const myTurn = isActiveDraft && curSlot?.acting_player === activeRole

    const previewCharId = selectedCharId
        || (hoverPreview?.player === activeRole ? hoverPreview?.character_id : null)
        || selectedPreview?.character_id
        || (isAdmin && hoverPreview?.character_id)
        || lastLockedChar?.char?.id
        || null
    const previewChar = previewCharId ? charMap[previewCharId] : null

    const { bannedIds, pickedByA, pickedByB } = useMemo(() => {
        const banned = new Set()
        const pA = new Set()
        const pB = new Set()
        for (const slot of draftSlots) {
            if (!slot.isFilled) continue
            if (slot.type === 'ban') banned.add(slot.character_id)
            else if (slot.acting_player === 'player_a') pA.add(slot.character_id)
            else pB.add(slot.character_id)
        }
        return { bannedIds: banned, pickedByA: pA, pickedByB: pB }
    }, [draftSlots])

    const filteredCharacters = useMemo(() => {
        if (!searchQuery.trim()) return characters
        const query = searchQuery.toLowerCase()
        return characters.filter(char => char.name.toLowerCase().includes(query))
    }, [characters, searchQuery])

    // ── Actions ──────────────────────────────────────────────────────────────
    const handleConfirm = () => {
        if (!selectedCharId || !myTurn || isPaused) return
        const charIdToSubmit = selectedCharId
        setSelectedChar(null)
        sendEvent('SELECT_PREVIEW', { character_id: null })
        sendEvent('SUBMIT_DRAFT_ACTION', { character_id: charIdToSubmit })
    }

    const handleSkipBan = () => {
        if (!myTurn || isPaused || !phase.includes('ban')) return
        if (!window.confirm("Are you sure you want to SKIP your ban?")) return

        setSelectedChar(null)
        sendEvent('SELECT_PREVIEW', { character_id: null })
        sendEvent('SUBMIT_DRAFT_ACTION', { character_id: null })
    }

    const handleCharClick = (charId) => {
        if (isPaused) return
        if (isAdmin) {
            const newSelection = charId === selectedCharId ? null : charId
            setSelectedChar(newSelection)
            sendEvent('SELECT_PREVIEW', { character_id: newSelection })
            return
        }
        if (!myTurn || activeRole !== curSlot?.acting_player) return
        if (bannedIds.has(charId) || pickedByA.has(charId) || pickedByB.has(charId)) return

        const newSelection = charId === selectedCharId ? null : charId
        setSelectedChar(newSelection)
        sendEvent('SELECT_PREVIEW', { character_id: newSelection })
    }

    const handleCharHover = useCallback((charId) => {
        if (!isPlayer || activeRole !== curSlot?.acting_player) return
        clearTimeout(hoverTimerRef.current)

        if (charMap[charId]?.splash_art_url) {
            const img = new Image()
            img.src = charMap[charId].splash_art_url
        }

        hoverTimerRef.current = setTimeout(() => {
            sendEvent('HOVER_PREVIEW', { character_id: charId })
        }, 80)
    }, [isPlayer, activeRole, curSlot?.acting_player, sendEvent, charMap, wsStatus])

    const handleCharHoverEnd = useCallback(() => {
        clearTimeout(hoverTimerRef.current)
        sendEvent('HOVER_PREVIEW', { character_id: null })
    }, [sendEvent])

    const handleAdminPause = () => sendEvent(isPaused ? 'ADMIN_RESUME' : 'ADMIN_PAUSE')
    const handleAdminForceConfirm = () => {
        if (!selectedCharId) return
        sendEvent('ADMIN_FORCE_CONFIRM', { character_id: selectedCharId })
    }
    const handleAdminReset = () => {
        if (window.confirm('Are you sure you want to RESET the entire draft? This cannot be undone.')) {
            sendEvent('ADMIN_RESET_DRAFT')
        }
    }

    const handleExitRoom = () => {
        disconnectWs()
        navigate('/lobby')
    }

    const handleDeleteSession = async () => {
        if (!window.confirm('Delete this session entirely? This cannot be undone.')) return
        try {
            await draftApi.deleteSession(session.id)
            disconnectWs()
            useDraftStore.getState().resetState()
            window.location.href = '/lobby'
        } catch (e) {
            alert('Failed to delete session.')
        }
    }

    const phaseBadgeStyle = (() => {
        if (phase.includes('ban')) return { bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.2)', color: '#fca5a5' }
        if (phase.includes('pick')) return { bg: 'rgba(99,102,241,0.1)', border: 'rgba(99,102,241,0.2)', color: '#a5b4fc' }
        if (phase === 'team_building') return { bg: 'rgba(168,85,247,0.1)', border: 'rgba(168,85,247,0.2)', color: '#c4b5fd' }
        return { bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.08)', color: '#71717a' }
    })()

    // ══════════════════════════════════════════════════════════════════════════
    //  RENDER — Conditional Layout
    // ══════════════════════════════════════════════════════════════════════════

    return (
        <div className="w-full h-screen flex flex-col overflow-hidden select-none relative"
            style={{ backgroundColor: '#050508', fontFamily: 'Inter, sans-serif' }}>

            {/* ── GLOBAL HEADER ────────────────────────────────────────────────── */}
            <header className="flex items-center justify-between px-3 md:px-6 py-3 flex-shrink-0 z-50 bg-[#08090d] border-b border-white/5 shadow-md">
                {/* Left Side: Logo & Session Name */}
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl flex items-center justify-center bg-indigo-500/10 border border-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.15)] flex-shrink-0">
                        <span className="text-base md:text-lg">⚔️</span>
                    </div>
                    <div className="flex flex-col">
                        <p className="font-bold text-indigo-400 text-[10px] md:text-xs tracking-[0.2em] uppercase leading-tight">
                            Genshin Draft
                        </p>
                        <p className="text-zinc-500 text-[8px] md:text-[10px] tracking-wider uppercase font-semibold">
                            {isAdmin ? 'Session Management' : 'Match Arena'}
                        </p>
                    </div>
                </div>

                {/* Right Side: Room Code, Role, Volume, Leave (Responsive Wrapping) */}
                <div className="flex flex-wrap items-center justify-end gap-4 flex-shrink-0 ml-auto">
                    {/* Room Code with Copy */}
                    <button
                        onClick={() => navigator.clipboard.writeText(code)}
                        className="group flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 hover:border-indigo-500/50 transition-colors cursor-pointer flex-shrink-0"
                        title="Click to copy room code"
                    >
                        <span className="hidden md:inline text-[10px] text-zinc-400 font-medium tracking-wider uppercase">Room:</span>
                        <span className="text-xs md:text-sm text-indigo-300 font-bold tracking-widest">{code}</span>
                        <svg className="w-4 h-4 text-zinc-500 group-hover:text-indigo-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                    </button>

                    <div className="hidden sm:block w-px h-6 bg-white/10" />

                    {/* Role Indicator */}
                    <span className="text-[10px] md:text-[11px] font-bold tracking-widest uppercase rounded-lg px-3 py-1.5 flex-shrink-0 shadow-sm"
                        style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.12)', color: '#a5b4fc' }}>
                        {isAdmin ? 'CASTER' : activeRole === 'player_a' ? 'TEAM A' : activeRole === 'player_b' ? 'TEAM B' : 'SPECTATOR'}
                    </span>

                    <div className="hidden sm:block w-px h-6 bg-white/10" />

                    {/* Audio Controller */}
                    <div className="hidden sm:block">
                        <AudioController
                            isMuted={isMuted}
                            masterVolume={masterVolume}
                            toggleMute={toggleMute}
                            handleVolumeChange={handleVolumeChange}
                        />
                    </div>

                    <div className="hidden sm:block w-px h-6 bg-white/10" />

                    {/* Admin Delete Room */}
                    {isAdmin && session?.id && (
                        <button onClick={handleDeleteSession} className="flex items-center gap-1.5 text-zinc-500 hover:text-red-500 transition-colors text-[10px] md:text-[11px] font-bold uppercase tracking-widest px-1 md:px-2 cursor-pointer flex-shrink-0">
                            <svg className="w-3.5 h-3.5 md:w-4 md:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            <span className="hidden sm:inline">Delete</span>
                        </button>
                    )}

                    {/* Leave Room / Logout equivalent */}
                    <button onClick={handleExitRoom} className="flex items-center gap-1.5 text-zinc-500 hover:text-red-400 transition-colors text-[10px] md:text-[11px] font-bold uppercase tracking-widest px-1 md:px-2 cursor-pointer flex-shrink-0">
                        <svg className="w-3.5 h-3.5 md:w-4 md:h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                            <polyline points="16 17 21 12 16 7" />
                            <line x1="21" y1="12" x2="9" y2="12" />
                        </svg>
                        <span className="hidden sm:inline">Leave</span>
                    </button>
                </div>
            </header>

            {/* Action Ticker removed from here */}

            <AnimatePresence mode="wait">

                {/* ████████████████████████████████████████████████████████████████████
                    CENTERED LAYOUT — Waiting & Coin Toss
                    ████████████████████████████████████████████████████████████████████ */}
                {isCentered && (
                    <motion.div
                        key="centered-layout"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.5 }}
                        className="fixed inset-0 flex items-center justify-center z-10"
                        style={{ background: '#08090d' }}
                    >
                        {/* Subtle radial glow behind centered content */}
                        <div className="absolute inset-0 pointer-events-none"
                            style={{ background: 'radial-gradient(ellipse 50% 40% at 50% 50%, rgba(99,102,241,0.04) 0%, transparent 100%)' }} />

                        {/* ── WAITING PHASE ────────────────────────────────── */}
                        {phase === 'waiting' && (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.1 }}
                                className="text-center w-full max-w-lg px-8"
                            >
                                <div className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-8"
                                    style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.1)' }}>
                                    <span className="text-4xl">⚔️</span>
                                </div>
                                <h1 className="text-4xl font-bold text-white mb-3" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
                                    Ready Up
                                </h1>
                                <p className="text-zinc-500 text-base mb-10">Both players must ready up to begin the draft.</p>

                                {/* Player status cards */}
                                <div className="flex gap-5 mb-10">
                                    {[
                                        { key: 'player_a', label: 'Team A', ready: session?.player_a_ready, accent: '#818cf8' },
                                        { key: 'player_b', label: 'Team B', ready: session?.player_b_ready, accent: '#a78bfa' },
                                    ].map((p) => (
                                        <motion.div
                                            key={p.key}
                                            animate={{ borderColor: p.ready ? 'rgba(34,197,94,0.25)' : 'rgba(255,255,255,0.04)' }}
                                            className="flex-1 rounded-2xl p-5 transition-all duration-500"
                                            style={{
                                                background: p.ready ? 'rgba(34,197,94,0.04)' : '#111318',
                                                border: '1px solid',
                                            }}
                                        >
                                            <div className="flex items-center justify-center gap-2.5 mb-3">
                                                <motion.div
                                                    animate={{ scale: p.ready ? [1, 1.3, 1] : 1 }}
                                                    className="w-2.5 h-2.5 rounded-full"
                                                    style={{ background: p.ready ? '#22c55e' : p.accent }} />
                                                <span className="text-sm font-bold tracking-[0.15em] uppercase"
                                                    style={{ color: p.ready ? '#86efac' : p.accent }}>
                                                    {p.label}
                                                </span>
                                            </div>
                                            <span className="text-xs font-semibold tracking-wider uppercase"
                                                style={{ color: p.ready ? '#4ade80' : '#52525b' }}>
                                                {p.ready ? '✓ READY' : 'NOT READY'}
                                            </span>
                                            {p.key === activeRole && (
                                                <p className="text-[10px] text-zinc-600 mt-1.5">(You)</p>
                                            )}
                                        </motion.div>
                                    ))}
                                </div>

                                {/* Ready button for players */}
                                {isPlayer && (() => {
                                    const amReady = activeRole === 'player_a' ? session?.player_a_ready : session?.player_b_ready
                                    const bothReady = session?.player_a_ready && session?.player_b_ready
                                    return (
                                        <>
                                            <PrimaryButton
                                                onClick={() => sendEvent('PLAYER_READY_UP', { is_ready: !amReady })}
                                                className="w-full tracking-[0.2em] mb-4"
                                                variant={amReady ? 'ghost' : 'primary'}
                                                style={{
                                                    background: amReady ? 'rgba(239,68,68,0.08)' : undefined,
                                                    border: amReady ? '1px solid rgba(239,68,68,0.2)' : undefined,
                                                    color: amReady ? '#fca5a5' : undefined,
                                                    boxShadow: amReady ? 'none' : '0 6px 30px -6px rgba(34,197,94,0.45)', // Custom green glow
                                                }}
                                            >
                                                {amReady ? '✕ CANCEL READY' : '✓ READY UP'}
                                            </PrimaryButton>

                                            {/* Both ready → waiting for admin */}
                                            {bothReady && (
                                                <motion.p
                                                    initial={{ opacity: 0 }}
                                                    animate={{ opacity: 1 }}
                                                    className="text-amber-400/60 text-xs mt-4 tracking-wider uppercase font-semibold animate-pulse"
                                                >
                                                    ⏳ Waiting for Admin to start the match...
                                                </motion.p>
                                            )}
                                        </>
                                    )
                                })()}

                                {/* Admin: START MATCH or spectator message */}
                                {isAdmin && (() => {
                                    const bothReady = session?.player_a_ready && session?.player_b_ready
                                    return bothReady ? (
                                        <PrimaryButton
                                            onClick={() => sendEvent('ADMIN_START_MATCH')}
                                            className="w-full tracking-[0.2em]"
                                        >
                                            ▶ START MATCH
                                        </PrimaryButton>
                                    ) : (
                                        <p className="text-zinc-600 text-xs mt-6 uppercase tracking-widest font-bold">
                                            Waiting for players...
                                        </p>
                                    )
                                })()}
                            </motion.div>
                        )}

                        {/* ── COIN TOSS PHASE ─────────────────────────────── */}
                        {phase === 'coin_toss' && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ type: 'spring', damping: 20 }}
                                className="text-center"
                            >
                                {/* Animated coin */}
                                <motion.div
                                    animate={coinFlipAnim === 'spinning'
                                        ? { rotateY: [0, 360], scale: [1, 1.1, 1] }
                                        : { rotateY: 0, scale: 1.15 }
                                    }
                                    transition={coinFlipAnim === 'spinning'
                                        ? { rotateY: { repeat: Infinity, duration: 0.6, ease: 'linear' }, scale: { repeat: Infinity, duration: 1.2, ease: 'easeInOut' } }
                                        : { type: 'spring', damping: 10, stiffness: 100 }
                                    }
                                    className="w-28 h-28 rounded-full flex items-center justify-center mx-auto mb-10"
                                    style={{
                                        background: coinFlipAnim === 'landed'
                                            ? 'linear-gradient(135deg, rgba(245,158,11,0.15) 0%, rgba(234,179,8,0.08) 100%)'
                                            : 'linear-gradient(135deg, rgba(245,158,11,0.1) 0%, rgba(234,179,8,0.05) 100%)',
                                        border: '2px solid rgba(245,158,11,0.2)',
                                        boxShadow: coinFlipAnim === 'landed'
                                            ? '0 0 60px rgba(245,158,11,0.15), inset 0 0 30px rgba(245,158,11,0.05)'
                                            : '0 0 30px rgba(245,158,11,0.1)',
                                    }}
                                >
                                    <span className="text-5xl" style={{ filter: 'drop-shadow(0 0 8px rgba(245,158,11,0.3))' }}>
                                        🪙
                                    </span>
                                </motion.div>

                                <AnimatePresence mode="wait">
                                    {coinFlipAnim === 'spinning' ? (
                                        <motion.div key="spin-text" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                            <h2 className="text-3xl font-bold text-white mb-3" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
                                                Coin Toss
                                            </h2>
                                            <p className="text-zinc-500 text-sm tracking-wide">Deciding who picks first...</p>
                                        </motion.div>
                                    ) : (
                                        <motion.div key="result-text"
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: 0.2 }}
                                        >
                                            <motion.h2
                                                initial={{ scale: 0.8 }}
                                                animate={{ scale: 1 }}
                                                className="text-4xl font-bold mb-4"
                                                style={{
                                                    fontFamily: 'Rajdhani, sans-serif',
                                                    color: coinTossWinner === 'player_a' ? '#818cf8' : '#a78bfa',
                                                    textShadow: `0 0 30px ${coinTossWinner === 'player_a' ? 'rgba(129,140,248,0.3)' : 'rgba(167,139,250,0.3)'}`,
                                                }}
                                            >
                                                {coinTossWinner === 'player_a' ? 'Team A' : 'Team B'} Wins!
                                            </motion.h2>
                                            {isAdmin ? (
                                                <div className="mt-8 flex justify-center">
                                                    <PrimaryButton
                                                        variant="primary"
                                                        onClick={() => sendEvent('ADMIN_START_DRAFT')}
                                                        className="px-10 py-3 text-lg tracking-widest"
                                                    >
                                                        START DRAFT
                                                    </PrimaryButton>
                                                </div>
                                            ) : (
                                                <p className="text-zinc-400 text-sm mt-4">
                                                    {coinTossWinner === activeRole ? 'You choose first!' : 'Waiting for selection...'}
                                                </p>
                                            )}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        )}
                    </motion.div>
                )}

                {/* ████████████████████████████████████████████████████████████████████
                    SPLIT LAYOUT — Draft, Team Building, Complete
                    Branches into CasterLayout (admin) or PlayerLayout (player)
                    ████████████████████████████████████████████████████████████████████ */}
                {!isCentered && (
                    <motion.div
                        key={phase}
                        initial={{ opacity: 0, x: 30 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                        className="h-full w-full flex flex-col"
                    >
                        {/* ── SHARED STATUS BAR ──────────────────────────── */}
                        <div className="relative flex items-center justify-between w-full px-6 py-3 flex-shrink-0"
                            style={{ background: '#0d0e14', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            <div className="flex items-center gap-4 z-10">
                                {isAdmin && isActiveDraft && (
                                    <span className="flex items-center gap-1.5 text-[11px] font-bold tracking-widest uppercase rounded-xl"
                                        style={{ padding: '6px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
                                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                                        LIVE
                                    </span>
                                )}
                                <span className="text-xs font-bold tracking-[0.2em] uppercase rounded-xl"
                                    style={{ padding: '6px 14px', background: phaseBadgeStyle.bg, border: `1px solid ${phaseBadgeStyle.border}`, color: phaseBadgeStyle.color }}>
                                    {PHASE_LABELS[phase] ?? phase}
                                </span>
                            </div>

                            {/* Center section: Action Ticker (Absolute Centered) */}
                            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
                                <AnimatePresence mode="wait">
                                    {isActiveDraft && curSlot && !isPaused && (
                                        <motion.div
                                            key={`ticker-${curSlot.seq}`}
                                            initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 5 }}
                                            transition={{ duration: 0.3, ease: 'easeInOut' }}
                                            className="flex items-center gap-3"
                                        >
                                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse shadow-[0_0_8px_rgba(96,165,250,0.8)]" />
                                            <span className="text-[12px] font-bold tracking-[0.2em] uppercase text-zinc-200" style={{ textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>
                                                {isAdmin
                                                    ? (<><span className={curSlot.acting_player === 'player_a' ? 'text-indigo-400 font-black' : 'text-purple-400 font-black'}>{curSlot.acting_player === 'player_a' ? 'TEAM A' : 'TEAM B'}</span> IS {curSlot.type === 'ban' ? 'BANNING' : 'PICKING'}</>)
                                                    : myTurn
                                                        ? (<><strong className="text-emerald-400 font-black animate-pulse">YOUR TURN</strong> TO {curSlot.type === 'ban' ? 'BAN' : 'PICK'}</>)
                                                        : (<><span className={curSlot.acting_player === 'player_a' ? 'text-indigo-400 font-black' : 'text-purple-400 font-black'}>{curSlot.acting_player === 'player_a' ? 'TEAM A' : 'TEAM B'}</span> IS {curSlot.type === 'ban' ? 'BANNING' : 'PICKING'}</>)
                                                }
                                            </span>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            <div className="flex items-center gap-3 z-10">
                                {isPaused && (
                                    <span className="text-xs font-bold tracking-widest uppercase rounded-xl animate-pulse"
                                        style={{ padding: '6px 12px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', color: '#fbbf24' }}>
                                        ⏸ PAUSED
                                    </span>
                                )}
                                {wsStatus !== 'OPEN' && (
                                    <span className="text-xs font-bold tracking-widest uppercase rounded-xl animate-pulse"
                                        style={{ padding: '6px 12px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>
                                        DISCONNECTED
                                    </span>
                                )}
                                {isAdmin && (
                                    <button
                                        onClick={() => setAdminPanelOpen(!adminPanelOpen)}
                                        className="text-xs font-bold tracking-widest uppercase rounded-xl transition-all duration-200"
                                        style={{ padding: '6px 12px', background: adminPanelOpen ? 'rgba(168,85,247,0.15)' : 'rgba(255,255,255,0.03)', border: adminPanelOpen ? '1px solid rgba(168,85,247,0.3)' : '1px solid rgba(255,255,255,0.06)', color: adminPanelOpen ? '#c4b5fd' : '#52525b', cursor: 'pointer' }}>
                                        ⚙ CONSOLE
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* ── MAIN CONTENT — Role-based layout ───────────── */}
                        <div className="flex flex-1 overflow-hidden relative">

                            {isAdmin ? (
                                /* ═══════════════════════════════════════════════
                                   CASTER LAYOUT — 25 / 50 / 25
                                   ═══════════════════════════════════════════════ */
                                <>
                                    {/* Team A Column (25%) */}
                                    <CasterTeamColumn
                                        label="Team A" player="player_a" accentColor="#818cf8" side="left"
                                        slots={draftSlots} charMap={charMap} currentSlot={curSlot}
                                    />

                                    {/* Spotlight Center (50%) */}
                                    <div className="flex-1 h-full relative overflow-hidden flex flex-col">
                                        {/* Team building / Complete states */}
                                        {phase === 'team_building' && (
                                            <div className="flex-1 flex items-center justify-center">
                                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
                                                    <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6"
                                                        style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.2)' }}>
                                                        <span className="text-4xl">🔄</span>
                                                    </div>
                                                    <h2 className="text-3xl font-bold text-white mb-2" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
                                                        Team Building Phase
                                                    </h2>
                                                    <p className="text-zinc-500 text-sm">Players are swapping characters with Season Free Characters.</p>
                                                </motion.div>
                                            </div>
                                        )}

                                        {phase === 'complete' && (
                                            <div className="flex-1 flex items-center justify-center overflow-y-auto">
                                                <CompleteSummary finalTeams={finalTeams} charMap={charMap} navigate={navigate} />
                                            </div>
                                        )}

                                        {/* Active Draft — Cinematic Spotlight */}
                                        {isActiveDraft && (
                                            <CasterSpotlight
                                                previewChar={previewChar}
                                                curSlot={curSlot}
                                                hoverPreview={hoverPreview}
                                                lastLockedChar={lastLockedChar}
                                                selectedCharId={selectedCharId}
                                                isActiveDraft={isActiveDraft}
                                                handleAdminForceConfirm={handleAdminForceConfirm}
                                            />
                                        )}

                                        {/* Fallback for Admin when waiting but not in active draft/team building/complete */}
                                        {!isActiveDraft && phase !== 'team_building' && phase !== 'complete' && (
                                            <div className="flex-1 flex flex-col items-center justify-center relative overflow-hidden">
                                                <div className="absolute inset-0 z-0">
                                                    <img src="https://images8.alphacoders.com/135/thumb-1920-1353872.jpeg" alt="arena" className="w-full h-full object-cover opacity-[0.15]" />
                                                    <div className="absolute inset-0 bg-gradient-to-t from-[#08090d] via-transparent to-[#08090d]" />
                                                </div>
                                                <div className="relative z-10 text-center">
                                                    <div className="w-16 h-16 rounded-full border-2 border-indigo-500/30 border-t-indigo-500 animate-spin mx-auto mb-6" />
                                                    <p className="text-indigo-400 font-bold tracking-[0.3em] uppercase text-sm animate-pulse">Waiting for Players...</p>
                                                    <p className="text-zinc-600 font-medium text-xs mt-2 uppercase tracking-widest">{phase.replace('_', ' ')}</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Team B Column (25%) */}
                                    <CasterTeamColumn
                                        label="Team B" player="player_b" accentColor="#a78bfa" side="right"
                                        slots={draftSlots} charMap={charMap} currentSlot={curSlot}
                                    />
                                </>
                            ) : (
                                /* ═══════════════════════════════════════════════
                                   PLAYER LAYOUT — 55 / 45
                                   ═══════════════════════════════════════════════ */
                                <>
                                    {/* Left: Draft Content (55%) */}
                                    <div className="w-full lg:w-[55%] h-full flex flex-col overflow-hidden box-border" style={{ padding: '20px 24px' }}>
                                        {phase === 'team_building' && (
                                            <div className="flex-1 flex items-center justify-center">
                                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
                                                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6"
                                                        style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.2)' }}>
                                                        <span className="text-3xl">🔄</span>
                                                    </div>
                                                    <h2 className="text-2xl font-bold text-white mb-2" style={{ fontFamily: 'Rajdhani, sans-serif' }}>Team Building Phase</h2>
                                                    <p className="text-zinc-500 text-sm max-w-sm mx-auto">You may swap ONE drafted character with a Season Free Character, or pass.</p>
                                                </motion.div>
                                            </div>
                                        )}
                                        {phase === 'complete' && (
                                            <div className="flex-1 flex items-center justify-center overflow-y-auto">
                                                <CompleteSummary finalTeams={finalTeams} charMap={charMap} navigate={navigate} />
                                            </div>
                                        )}
                                        {isActiveDraft && (
                                            <>
                                                {/* Search Bar */}
                                                <div className="mb-4 shrink-0 px-1">
                                                    <input
                                                        type="text"
                                                        placeholder="Search character..."
                                                        value={searchQuery}
                                                        onChange={(e) => setSearchQuery(e.target.value)}
                                                        className="w-full bg-[#08090d] border border-white/5 text-zinc-300 px-4 py-3 rounded-xl focus:outline-none focus:border-indigo-500/50 transition-colors shadow-inner"
                                                        style={{ boxShadow: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.2)' }}
                                                    />
                                                </div>

                                                <div className="flex-1 overflow-y-auto h-full rounded-2xl relative box-border scroll-smooth" style={{ background: '#0d0e14', border: '1px solid rgba(255,255,255,0.03)' }}>
                                                    <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-7 lg:grid-cols-8 xl:grid-cols-9 gap-2 pl-4 pr-6 pt-5 pb-48 box-border">
                                                        {filteredCharacters.map((char) => {
                                                            const isBanned = bannedIds.has(char.id)
                                                            const isPickedA = pickedByA.has(char.id)
                                                            const isPickedB = pickedByB.has(char.id)
                                                            const isUsed = isBanned || isPickedA || isPickedB
                                                            const isSelected = selectedCharId === char.id
                                                            return (
                                                                <motion.button key={char.id}
                                                                    onClick={() => handleCharClick(char.id)}
                                                                    onMouseEnter={() => handleCharHover(char.id)}
                                                                    onMouseLeave={handleCharHoverEnd}
                                                                    whileHover={!isUsed && myTurn ? { scale: 1.05 } : {}}
                                                                    whileTap={!isUsed && myTurn ? { scale: 0.97 } : {}}
                                                                    className="relative flex flex-col items-center rounded-xl transition-all duration-200 group"
                                                                    style={{
                                                                        padding: '8px 4px',
                                                                        background: isSelected ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.02)',
                                                                        border: isSelected ? '1px solid rgba(99,102,241,0.8)' : '1px solid rgba(255,255,255,0.04)',
                                                                        cursor: isUsed ? 'default' : myTurn ? 'pointer' : 'default',
                                                                        opacity: isUsed ? 0.35 : isPaused ? 0.6 : 1,
                                                                        filter: isBanned ? 'grayscale(100%)' : 'none',
                                                                    }}>
                                                                    <div className="w-14 h-14 md:w-16 md:h-16 rounded-lg overflow-hidden mb-1.5" style={{ background: '#191c24' }}>
                                                                        {char.icon_url && <img src={char.icon_url} alt={char.name} className="w-full h-full object-cover" loading="lazy" />}
                                                                    </div>
                                                                    <span className="text-[10px] text-zinc-400 truncate w-full text-center leading-tight">{char.name}</span>
                                                                    {isBanned && (<div className="absolute inset-0 flex items-center justify-center rounded-xl"><span className="text-red-500 text-2xl font-bold opacity-70">✕</span></div>)}
                                                                    {(isPickedA || isPickedB) && (
                                                                        <div className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full"
                                                                            style={{ background: isPickedA ? '#818cf8' : '#a78bfa', boxShadow: `0 0 6px ${isPickedA ? 'rgba(129,140,248,0.4)' : 'rgba(167,139,250,0.4)'}` }} />
                                                                    )}
                                                                </motion.button>
                                                            )
                                                        })}
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </div>

                                    {/* Right: Art Panel (45%) containing BOTH Team Panels */}
                                    <div className="hidden lg:flex lg:w-[45%] h-full max-h-screen flex-col bg-[#050508] border-l border-white/5 overflow-hidden pb-4">

                                        {/* Top: Opponent Team Panel */}
                                        {isActiveDraft && (
                                            <div className="flex-shrink-0 h-[25%] flex flex-col justify-center p-4 md:p-6 pb-2 border-b border-white/5 bg-[#08090d] z-20">
                                                <TeamPanel
                                                    label={activeRole === 'player_a' ? "Team B (Opponent)" : "Team A (Opponent)"}
                                                    player={activeRole === 'player_a' ? 'player_b' : 'player_a'}
                                                    accentColor={activeRole === 'player_a' ? "#a78bfa" : "#818cf8"}
                                                    slots={draftSlots} charMap={charMap} currentSlot={curSlot}
                                                />
                                            </div>
                                        )}

                                        {/* Middle: Action Zone (Splash Art & Confirm) */}
                                        <div className="flex-1 min-h-0 relative w-full flex flex-col justify-end p-4 md:p-6 bg-[#08090d] overflow-hidden">
                                            <AnimatePresence mode="wait">
                                                {previewChar?.splash_art_url ? (
                                                    <motion.div key={`art-${previewChar.id}`}
                                                        initial={{ opacity: 0, scale: 1.05 }} animate={{ opacity: 0.8, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                                                        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                                                        className="absolute inset-0"
                                                    >
                                                        <img src={previewChar.splash_art_url} alt={previewChar.name} className="absolute inset-0 w-full h-full object-contain object-center opacity-90 z-0 pointer-events-none" />
                                                    </motion.div>
                                                ) : (
                                                    <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 flex items-center justify-center">
                                                        <div className="text-center">
                                                            <span className="text-6xl opacity-10">⚔️</span>
                                                            <p className="text-zinc-700 text-sm mt-4 tracking-widest uppercase font-bold">Select a character</p>
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>

                                            {/* Gradient Overlays */}
                                            <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to right, #08090d 0%, rgba(8,9,13,0.4) 20%, transparent 60%)' }} />
                                            <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to top, #08090d 0%, transparent 40%)' }} />
                                            <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to bottom, rgba(8,9,13,0.4) 0%, transparent 30%)' }} />

                                            <AnimatePresence>
                                                {lastLockedChar && (
                                                    <motion.div key="lock-flash" initial={{ opacity: 0.8 }} animate={{ opacity: 0 }} exit={{ opacity: 0 }}
                                                        transition={{ duration: 1.5 }} className="absolute inset-0 pointer-events-none"
                                                        style={{ background: lastLockedChar.type === 'ban' ? 'radial-gradient(circle at center, rgba(239,68,68,0.2) 0%, transparent 70%)' : 'radial-gradient(circle at center, rgba(99,102,241,0.2) 0%, transparent 70%)' }} />
                                                )}
                                            </AnimatePresence>

                                            <div className="relative z-10 w-full mb-2">
                                                <AnimatePresence mode="wait">
                                                    {previewChar && (
                                                        <motion.div key={`info-${previewChar.id}`}
                                                            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                                                            transition={{ duration: 0.3 }} className="max-w-sm relative z-10">
                                                            <h3 className="text-4xl font-bold text-white mb-6" style={{ fontFamily: 'Rajdhani, sans-serif', textShadow: '0 2px 10px rgba(0,0,0,0.8)' }}>{previewChar.name}</h3>
                                                            {isPlayer && myTurn && !isPaused && selectedCharId && (
                                                                <PrimaryButton onClick={handleConfirm}>
                                                                    {curSlot?.type === 'ban' ? 'CONFIRM BAN' : 'CONFIRM PICK'}
                                                                </PrimaryButton>
                                                            )}
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>

                                                {/* Skip Ban Button */}
                                                {isPlayer && myTurn && !isPaused && phase.includes('ban') && (
                                                    <motion.button
                                                        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                                        onClick={handleSkipBan}
                                                        className="w-full max-w-sm mt-3 py-3 font-bold text-zinc-400 bg-transparent border-2 border-zinc-700 rounded-xl hover:bg-zinc-800 hover:text-white transition-all tracking-widest uppercase text-sm"
                                                    >
                                                        SKIP BAN
                                                    </motion.button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Bottom: My Team Panel */}
                                        {isActiveDraft && (
                                            <div className="flex-shrink-0 h-[25%] flex flex-col justify-center p-4 md:p-6 pt-2 border-t border-white/5 bg-[#08090d] z-20 shadow-[0_-10px_30px_rgba(0,0,0,0.3)]">
                                                <TeamPanel
                                                    label={activeRole === 'player_a' ? "Team A (You)" : "Team B (You)"}
                                                    player={activeRole === 'player_a' ? 'player_a' : 'player_b'}
                                                    accentColor={activeRole === 'player_a' ? "#818cf8" : "#a78bfa"}
                                                    slots={draftSlots} charMap={charMap} currentSlot={curSlot}
                                                />
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}

                            {/* ── ADMIN CONSOLE (overlay — both layouts) ──── */}
                            <AnimatePresence>
                                {isAdmin && adminPanelOpen && (
                                    <motion.div
                                        initial={{ x: 320, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 320, opacity: 0 }}
                                        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                                        className="absolute top-0 right-0 h-full w-72 z-40 flex flex-col"
                                        style={{ background: '#0d0e14', borderLeft: '1px solid rgba(255,255,255,0.04)' }}>
                                        <div className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                            <span className="text-xs font-bold tracking-[0.15em] uppercase text-purple-400">⚙ Admin Console</span>
                                            <button onClick={() => setAdminPanelOpen(false)} className="text-zinc-600 hover:text-zinc-400 transition-colors text-lg" style={{ cursor: 'pointer', background: 'none', border: 'none' }}>✕</button>
                                        </div>
                                        <div className="flex flex-col gap-3 p-4 flex-1 overflow-y-auto">
                                            <div className="rounded-xl p-3" style={{ background: '#111318', border: '1px solid rgba(255,255,255,0.03)' }}>
                                                <p className="text-[10px] text-zinc-600 font-bold tracking-widest uppercase mb-1">Status</p>
                                                <p className="text-sm text-zinc-300 font-semibold">{PHASE_LABELS[phase] ?? phase}</p>
                                                {curSlot && (<><p className="text-[10px] text-zinc-600 font-bold tracking-widest uppercase mt-3 mb-1">Current Turn</p><p className="text-sm text-zinc-300 font-semibold">{curSlot.acting_player === 'player_a' ? 'Team A' : 'Team B'} — Slot #{curSlot.seq}</p></>)}
                                                {hoverPreview?.character_id && (<><p className="text-[10px] text-zinc-600 font-bold tracking-widest uppercase mt-3 mb-1">Player Hovering</p><p className="text-sm text-amber-300 font-semibold">{charMap[hoverPreview.character_id]?.name ?? '?'} ({hoverPreview.player === 'player_a' ? 'A' : 'B'})</p></>)}
                                            </div>
                                            <PrimaryButton onClick={handleAdminPause} variant="ghost" className="w-full tracking-[0.2em] mb-3"
                                                style={{ color: isPaused ? '#86efac' : '#fbbf24' }}>
                                                {isPaused ? '▶ RESUME TIMER' : '⏸ PAUSE TIMER'}
                                            </PrimaryButton>
                                            <PrimaryButton onClick={handleAdminForceConfirm} disabled={!selectedCharId || !isActiveDraft} variant="ghost" className="w-full tracking-[0.2em]">
                                                ⚡ FORCE CONFIRM
                                            </PrimaryButton>
                                            <div className="mt-auto pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                                                <PrimaryButton onClick={handleAdminReset} variant="ghost" className="w-full tracking-[0.2em]"
                                                    style={{ color: '#f87171' }}>
                                                    🔄 RESET DRAFT
                                                </PrimaryButton>
                                                <p className="text-[10px] text-zinc-700 text-center mt-2">This will clear all bans, picks, and reset to waiting.</p>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* ── MOBILE confirm bar (player only) ── */}
                        {isPlayer && selectedCharId && myTurn && !isPaused && (
                            <div className="lg:hidden flex-shrink-0 p-4" style={{ background: '#0d0e14', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0" style={{ background: '#191c24' }}>
                                        {charMap[selectedCharId]?.icon_url && <img src={charMap[selectedCharId].icon_url} alt={charMap[selectedCharId].name} className="w-full h-full object-cover" />}
                                    </div>
                                    <span className="font-bold text-white flex-1">{charMap[selectedCharId]?.name}</span>
                                    <PrimaryButton onClick={handleConfirm} disabled={!selectedCharId || !myTurn || isPaused} className="w-auto px-8 tracking-[0.2em] py-2 lg:py-4">
                                        {curSlot?.type === 'ban' ? 'BAN' : 'PICK'}
                                    </PrimaryButton>
                                </div>
                            </div>
                        )}
                    </motion.div>
                )}

            </AnimatePresence>

            {/* ── GLOBAL OVERLAYS (always on top of either layout) ────── */}

            {/* Phase transition banner */}
            <AnimatePresence>
                {phaseTransitionLabel && (
                    <motion.div key="phase-banner"
                        initial={{ opacity: 0, y: -20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -20, scale: 0.95 }}
                        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center py-5"
                        style={{ background: 'linear-gradient(to bottom, rgba(99,102,241,0.2), transparent)', backdropFilter: 'blur(12px)' }}>
                        <span className="text-2xl font-bold tracking-[0.3em] uppercase text-indigo-300"
                            style={{ fontFamily: 'Rajdhani, sans-serif', textShadow: '0 0 40px rgba(99,102,241,0.4)' }}>
                            {phaseTransitionLabel}
                        </span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Lock-in banner */}
            <AnimatePresence mode="popLayout">
                {lastAction && (
                    <motion.div key={`lock-banner-${lastAction.sequence_num}`}
                        initial={{ opacity: 0, y: 50, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 rounded-2xl"
                        style={{
                            padding: '12px 24px',
                            background: lastAction.action_type === 'ban' ? 'rgba(239,68,68,0.12)' : 'rgba(99,102,241,0.12)',
                            border: `1px solid ${lastAction.action_type === 'ban' ? 'rgba(239,68,68,0.25)' : 'rgba(99,102,241,0.25)'}`,
                            backdropFilter: 'blur(16px)',
                            boxShadow: `0 8px 32px ${lastAction.action_type === 'ban' ? 'rgba(239,68,68,0.15)' : 'rgba(99,102,241,0.15)'}`
                        }}>
                        <div className="w-8 h-8 rounded-lg overflow-hidden" style={{ background: '#191c24' }}>
                            {charMap[lastAction.character_id]?.icon_url && <img src={charMap[lastAction.character_id].icon_url} alt={charMap[lastAction.character_id].name} className="w-full h-full object-cover" />}
                        </div>
                        <span className="text-sm font-bold tracking-wider uppercase" style={{ color: lastAction.action_type === 'ban' ? '#fca5a5' : '#a5b4fc' }}>
                            {lastAction.acting_player === 'player_a' ? 'Team A' : 'Team B'}
                            {lastAction.action_type === 'ban' ? ' BANNED ' : ' PICKED '}
                            {charMap[lastAction.character_id]?.name}
                        </span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Pause overlay */}
            <AnimatePresence>
                {isPaused && isActiveDraft && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-30 flex items-center justify-center pointer-events-none"
                        style={{ background: 'rgba(8,9,13,0.6)', backdropFilter: 'blur(4px)' }}>
                        <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="text-center">
                            <span className="text-5xl font-bold tracking-[0.3em] uppercase text-amber-400/80 animate-pulse"
                                style={{ fontFamily: 'Rajdhani, sans-serif', textShadow: '0 0 40px rgba(245,158,11,0.3)' }}>
                                PAUSED
                            </span>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
            {/* Reconnecting overlay */}
            <AnimatePresence>
                {wsStatus !== 'OPEN' && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none"
                        style={{ background: 'rgba(8,9,13,0.85)', backdropFilter: 'blur(8px)' }}>
                        <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="text-center bg-black/80 px-10 py-8 rounded-2xl border border-amber-500/30 shadow-[0_0_50px_rgba(245,158,11,0.15)] flex flex-col items-center">
                            <svg className="animate-spin h-10 w-10 text-amber-500 mb-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            <span className="text-2xl font-bold tracking-[0.2em] uppercase text-amber-400"
                                style={{ fontFamily: 'Rajdhani, sans-serif' }}>
                                RECONNECTING...
                            </span>
                            <p className="text-zinc-500 text-sm mt-2">Restoring connection to the match server.</p>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

/* ═══════════════════════════════════════════════════════════════════════════
   TeamPanel
   ═══════════════════════════════════════════════════════════════════════════ */
function TeamPanel({ label, player, accentColor, slots, charMap, currentSlot }) {
    const playerSlots = slots.filter((s) => s.acting_player === player)
    const banSlots = playerSlots.filter((s) => s.type === 'ban')
    const pickSlots = playerSlots.filter((s) => s.type === 'pick')

    return (
        <div className="flex-shrink-0 flex flex-col rounded-2xl h-full min-h-0 overflow-y-auto"
            style={{ padding: '12px 16px', background: '#0d0e14', border: '1px solid rgba(255,255,255,0.03)' }}>
            <div className="flex items-center justify-between mb-3 flex-shrink-0">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: accentColor }} />
                    <span className="text-xs font-bold tracking-[0.15em] uppercase" style={{ color: accentColor }}>{label}</span>
                </div>
                <span className="text-[10px] text-zinc-600 font-semibold tracking-wider uppercase">
                    {pickSlots.filter((s) => s.isFilled).length}/8 picks
                </span>
            </div>
            <div className="flex gap-1 items-start flex-wrap flex-shrink-0">
                {banSlots.map((slot) => (
                    <SlotCell key={slot.seq} slot={slot} charMap={charMap} isCurrent={currentSlot?.seq === slot.seq} isBan={true} />
                ))}
                {banSlots.length > 0 && <div className="w-px h-10 mx-1" style={{ background: 'rgba(255,255,255,0.06)' }} />}
                {pickSlots.map((slot) => (
                    <SlotCell key={slot.seq} slot={slot} charMap={charMap} isCurrent={currentSlot?.seq === slot.seq} isBan={false} />
                ))}
            </div>
        </div>
    )
}


/* ═══════════════════════════════════════════════════════════════════════════
   SlotCell
   ═══════════════════════════════════════════════════════════════════════════ */

function SlotCell({ slot, charMap, isCurrent, isBan }) {
    const char = slot.isFilled ? charMap[slot.character_id] : null
    return (
        <div className="flex flex-col items-center gap-1">
            <div className="relative flex items-center justify-center rounded-xl overflow-hidden transition-all duration-300 flex-shrink-0"
                style={{ width: 44, height: 44, background: slot.isFilled ? (slot.character_id === null ? 'rgba(39,39,42,0.8)' : '#191c24') : '#111318', border: isCurrent ? '2px solid rgba(99,102,241,0.6)' : slot.isFilled && slot.character_id === null ? '1px dashed rgba(239,68,68,0.4)' : '1px solid rgba(255,255,255,0.04)', boxShadow: isCurrent ? '0 0 12px rgba(99,102,241,0.15)' : 'none' }}>
                {slot.isFilled && slot.character_id === null ? (
                    <span className="text-[8px] font-bold text-red-500 tracking-tighter uppercase text-center block leading-tight">SKIP<br />PED</span>
                ) : char?.icon_url ? (
                    <img src={char.icon_url} alt={char.name} className="w-full h-full object-cover"
                        style={{ filter: isBan ? 'grayscale(80%)' : 'none', opacity: isBan ? 0.5 : 1 }} />
                ) : (
                    <span className="text-[10px] text-zinc-700 font-bold">{isCurrent ? '•' : '—'}</span>
                )}
                {isBan && slot.isFilled && slot.character_id !== null && (
                    <div className="absolute inset-0 flex items-center justify-center"><span className="text-red-500/60 text-lg font-bold">✕</span></div>
                )}
                {isCurrent && (
                    <div className="absolute inset-0 rounded-xl animate-pulse" style={{ border: '2px solid rgba(99,102,241,0.4)' }} />
                )}
            </div>
            {char && (
                <span className="text-[10px] text-zinc-400 font-medium leading-none max-w-[44px] truncate text-center block">
                    {char.name}
                </span>
            )}
        </div>
    )
}
