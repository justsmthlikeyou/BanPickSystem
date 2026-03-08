import { create } from 'zustand'

// ── Draft Template (mirrored from backend draft_service.py) ──────────────────
// Each entry: { seq, type: 'ban'|'pick', phase, role: 'first'|'second' }
// 'first'  → session.first_pick_player
// 'second' → the other player
export const DRAFT_TEMPLATE = [
    // Phase 1 — First Ban (2 bans: A→B)
    { seq: 1, type: 'ban', phase: 'ban_phase_1', role: 'first' },
    { seq: 2, type: 'ban', phase: 'ban_phase_1', role: 'second' },
    // Phase 2 — First Pick (8 picks: A-BB-AA-BB-A)
    { seq: 3, type: 'pick', phase: 'pick_phase_1', role: 'first' },
    { seq: 4, type: 'pick', phase: 'pick_phase_1', role: 'second' },
    { seq: 5, type: 'pick', phase: 'pick_phase_1', role: 'second' },
    { seq: 6, type: 'pick', phase: 'pick_phase_1', role: 'first' },
    { seq: 7, type: 'pick', phase: 'pick_phase_1', role: 'first' },
    { seq: 8, type: 'pick', phase: 'pick_phase_1', role: 'second' },
    { seq: 9, type: 'pick', phase: 'pick_phase_1', role: 'second' },
    { seq: 10, type: 'pick', phase: 'pick_phase_1', role: 'first' },
    // Phase 3 — Second Ban (2 bans: A→B)
    { seq: 11, type: 'ban', phase: 'ban_phase_2', role: 'first' },
    { seq: 12, type: 'ban', phase: 'ban_phase_2', role: 'second' },
    // Phase 4 — Second Pick (8 picks: B-AA-BB-AA-B — reversed priority)
    { seq: 13, type: 'pick', phase: 'pick_phase_2', role: 'second' },
    { seq: 14, type: 'pick', phase: 'pick_phase_2', role: 'first' },
    { seq: 15, type: 'pick', phase: 'pick_phase_2', role: 'first' },
    { seq: 16, type: 'pick', phase: 'pick_phase_2', role: 'second' },
    { seq: 17, type: 'pick', phase: 'pick_phase_2', role: 'second' },
    { seq: 18, type: 'pick', phase: 'pick_phase_2', role: 'first' },
    { seq: 19, type: 'pick', phase: 'pick_phase_2', role: 'first' },
    { seq: 20, type: 'pick', phase: 'pick_phase_2', role: 'second' },
]

// ── Phase labels for display ──────────────────────────────────────────────────
export const PHASE_LABELS = {
    waiting: 'WAITING FOR PLAYERS',
    coin_toss: 'COIN TOSS',
    ban_phase_1: 'BAN PHASE I',
    pick_phase_1: 'PICK PHASE I',
    ban_phase_2: 'BAN PHASE II',
    pick_phase_2: 'PICK PHASE II',
    team_building: 'TEAM BUILDING',
    complete: 'DRAFT COMPLETE',
}

export const ACTIVE_DRAFT_PHASES = new Set([
    'ban_phase_1', 'pick_phase_1', 'ban_phase_2', 'pick_phase_2',
])

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Resolve 'first'/'second' to 'player_a'/'player_b' using first_pick_player.
 */
function resolveRole(role, firstPickPlayer) {
    if (!firstPickPlayer) return null
    const second = firstPickPlayer === 'player_a' ? 'player_b' : 'player_a'
    return role === 'first' ? firstPickPlayer : second
}

/**
 * Build the full 20-slot array, merging template with completed draft_actions.
 * Returns an array of slot objects:
 * {
 *   seq, type, phase,
 *   acting_player: 'player_a'|'player_b'|null,
 *   character_id: number|null,   (null = not yet filled)
 *   isFilled: bool,
 *   isCurrent: bool,             (the very next unfilled slot)
 * }
 */
function buildSlots(session) {
    if (!session) return []
    const { first_pick_player, draft_actions = [] } = session
    const actionMap = {}
    for (const a of draft_actions) actionMap[a.sequence_num] = a

    let foundCurrent = false
    return DRAFT_TEMPLATE.map((t) => {
        const action = actionMap[t.seq]
        const isFilled = !!action
        const isCurrent = !isFilled && !foundCurrent
        if (isCurrent) foundCurrent = true

        // Explicitly resolve action type from Slot Map:
        // Slots 1-2 & 11-12 are BAN, Slots 3-10 & 13-20 are PICK
        const explicitType = (t.seq === 1 || t.seq === 2 || t.seq === 11 || t.seq === 12) ? 'ban' : 'pick'

        return {
            seq: t.seq,
            type: explicitType,
            phase: t.phase,
            acting_player: resolveRole(t.role, first_pick_player),
            character_id: action?.character_id ?? null,
            isFilled,
            isCurrent,
        }
    })
}

/**
 * Given completed slots, return bans and ordered picks per player.
 * picks for each player are in sequence order (picks[0..3] = Phase 2, [4..7] = Phase 4)
 */
export function computeTeams(slots) {
    const teams = {
        player_a: { bans: [], picks: [] },
        player_b: { bans: [], picks: [] },
    }
    for (const s of slots) {
        if (!s.isFilled) continue
        const player = s.acting_player
        if (!player) continue
        if (s.type === 'ban') teams[player].bans.push(s.character_id)
        else teams[player].picks.push(s.character_id)
    }
    return teams
}

// ── Zustand Store ─────────────────────────────────────────────────────────────

const useDraftStore = create((set, get) => ({
    // ── Session data ──────────────────────────────────────────────────────────
    session: null,
    draftSlots: [],
    phase: 'waiting',
    characters: [],          // Full character list from REST
    charMap: {},             // id → character object (for fast lookups)
    freeChars: [],           // Season free characters (populated in team_building)

    // ── Identity ──────────────────────────────────────────────────────────────
    myRole: localStorage.getItem('role') || null,    // 'player_a'|'player_b'|'admin'
    myUsername: localStorage.getItem('username') || null,

    // ── Coin toss ──────────────────────────────────────────────────────────────
    coinTossResult: null,   // 'heads'|'tails'
    coinTossWinner: null,   // 'player_a'|'player_b'
    coinTossLoser: null,
    winnerChose: null,      // { privilege, sub_choice }
    loserChose: null,       // { sub_choice, loser_privilege }

    // ── UI ────────────────────────────────────────────────────────────────────
    selectedCharId: null,   // Character ID selected by active player (pending action)
    phaseTransitionLabel: null,  // Briefly set to flash phase transition banner
    isPaused: false,        // Admin paused the draft
    hoverPreview: null,     // { player, character_id } from HOVER_PREVIEW events
    selectedPreview: null,  // { player, character_id } from SELECT_PREVIEW events
    swapState: {            // Team building swap state per player
        selectedDraftedId: null,
        selectedFreeId: null,
        hasActed: false,       // true after SWAP or PASS sent
        opponentActed: false,
    },
    finalTeams: null,        // Populated on SESSION_COMPLETE

    // ── WebSocket ref (set by useWebSocket hook) ──────────────────────────────
    wsRef: null,
    wsStatus: 'CLOSED',
    pendingActionTimer: null,

    // ── Actions ───────────────────────────────────────────────────────────────

    setIdentity: (role, username) => {
        localStorage.setItem('role', role)
        localStorage.setItem('username', username)
        set({ myRole: role, myUsername: username })
    },

    resetState: () => {
        set({
            session: null, draftSlots: [], phase: 'waiting', selectedCharId: null,
            phaseTransitionLabel: null, isPaused: false, hoverPreview: null,
            selectedPreview: null, coinTossResult: null, coinTossWinner: null,
            coinTossLoser: null, winnerChose: null, loserChose: null,
            finalTeams: null,
            swapState: { selectedDraftedId: null, selectedFreeId: null, hasActed: false, opponentActed: false },
            pendingActionTimer: null
        })
    },

    setCharacters: (list) => {
        const charMap = {}
        for (const c of list) charMap[c.id] = c
        set({ characters: list, charMap })
    },

    setFreeChars: (list) => set({ freeChars: list }),

    setWsRef: (ref) => set({ wsRef: ref }),
    setWsStatus: (status) => set({ wsStatus: status }),

    disconnectWs: () => {
        const ws = get().wsRef
        if (ws) {
            ws.onclose = null   // Prevent reconnect loop
            ws.close(1000, 'user left room')
        }
        set({ wsRef: null })
    },

    setSelectedChar: (id) => set({ selectedCharId: id }),

    /** Apply a full session snapshot (SESSION_STATE event or on-connect). */
    applySnapshot: (snapshot) => {
        const slots = buildSlots(snapshot)
        set({
            session: snapshot,
            draftSlots: slots,
            phase: snapshot.status,
            // Rehydrate coin toss state for late joiners
            coinTossWinner: snapshot.coin_toss_winner ?? null,
            coinTossLoser: snapshot.coin_toss_winner
                ? (snapshot.coin_toss_winner === 'player_a' ? 'player_b' : 'player_a')
                : null,
        })
    },

    setSwapSelected: (field, id) =>
        set((s) => ({ swapState: { ...s.swapState, [field]: id } })),

    markSwapActed: () =>
        set((s) => ({ swapState: { ...s.swapState, hasActed: true } })),

    markOpponentActed: () =>
        set((s) => ({ swapState: { ...s.swapState, opponentActed: true } })),

    /** Send a WebSocket event. Silently fails if WS is not connected. */
    sendEvent: (event, payload = {}) => {
        const { wsRef } = get()
        if (wsRef && wsRef.readyState === WebSocket.OPEN) {
            wsRef.send(JSON.stringify({ event, payload }))

            // ACTION RECOVERY TIMEOUT (5 seconds)
            if (event === 'SUBMIT_DRAFT_ACTION' || event === 'SUBMIT_FREE_SWAP') {
                const recoveryTimer = setTimeout(() => {
                    console.warn('[WS] Action timeout (5s). Requesting SYNC_STATE recovery...')
                    get().sendEvent('SYNC_STATE')
                }, 5000)
                set({ pendingActionTimer: recoveryTimer })
            }
        } else {
            console.warn('[WS] Cannot send — socket not open:', event)
        }
    },

    // ── WebSocket Event Router ─────────────────────────────────────────────────
    handleWsEvent: (msg) => {
        const { event, payload } = msg

        // Clear pending action timer if state sync or action arrives
        if (['SESSION_STATE', 'DRAFT_ACTION', 'PHASE_CHANGED', 'SWAP_RESULT'].includes(event)) {
            const { pendingActionTimer } = get()
            if (pendingActionTimer) {
                clearTimeout(pendingActionTimer)
                set({ pendingActionTimer: null })
            }
        }

        switch (event) {
            //── Session state sync ──────────────────────────────────────────────────
            case 'SESSION_STATE':
            case 'START_MATCH_SYNC': {
                get().applySnapshot(payload)
                if (event === 'START_MATCH_SYNC') {
                    set({ phase: 'ban_phase_1' })
                }
                break
            }

            //── Ready-up ────────────────────────────────────────────────────────────
            case 'PLAYER_READY': {
                set((s) => ({
                    session: s.session
                        ? {
                            ...s.session,
                            player_a_ready: payload.player === 'player_a' ? payload.is_ready : s.session.player_a_ready,
                            player_b_ready: payload.player === 'player_b' ? payload.is_ready : s.session.player_b_ready,
                        }
                        : s.session,
                }))
                break
            }

            //── Coin toss ────────────────────────────────────────────────────────────
            case 'COIN_TOSS_RESULT': {
                set({
                    coinTossResult: payload.result,
                    coinTossWinner: payload.winner,
                    coinTossLoser: payload.loser,
                    phase: 'coin_toss',
                })
                set((s) => ({
                    session: s.session ? { ...s.session, status: 'coin_toss', coin_toss_winner: payload.winner } : s.session,
                }))
                break
            }
            case 'WINNER_CHOSE': {
                set({ winnerChose: { privilege: payload.privilege, sub_choice: payload.sub_choice } })
                break
            }
            case 'LOSER_CHOSE': {
                set({ loserChose: { loser_privilege: payload.loser_privilege, sub_choice: payload.sub_choice } })
                break
            }

            //── Phase change ─────────────────────────────────────────────────────────
            case 'PHASE_CHANGED': {
                const newStatus = payload.new_status
                set((s) => {
                    return {
                        phaseTransitionLabel: PHASE_LABELS[newStatus] ?? newStatus,
                        selectedCharId: null,
                        selectedPreview: null,
                    }
                })
                // Clear transition label after 2.5s
                setTimeout(() => set({ phaseTransitionLabel: null }), 2500)
                break
            }

            //── Draft action ─────────────────────────────────────────────────────────
            case 'DRAFT_ACTION': {
                set((s) => {
                    return {
                        selectedCharId: null,
                        selectedPreview: null,
                    }
                })
                break
            }

            //── Free swap ─────────────────────────────────────────────────────────────
            case 'FREE_SWAP_MADE': {
                const { player } = payload
                const myRole = get().myRole
                if (player === myRole) get().markSwapActed()
                else get().markOpponentActed()
                break
            }
            case 'PLAYER_PASSED_SWAP': {
                const { player } = payload
                const myRole = get().myRole
                if (player === myRole) get().markSwapActed()
                else get().markOpponentActed()
                break
            }

            //── Complete ──────────────────────────────────────────────────────────────
            case 'SESSION_COMPLETE': {
                set({
                    phase: 'complete',
                    finalTeams: payload.final_teams,
                })
                break
            }

            case 'ERROR': {
                console.error('[WS SERVER ERROR]', payload.message)
                break
            }

            //── Admin events ──────────────────────────────────────────────────────
            case 'ADMIN_PAUSE': {
                set({ isPaused: true })
                break
            }
            case 'ADMIN_RESUME': {
                set({ isPaused: false })
                break
            }

            //── Hover preview (relayed from another player) ────────────────────
            case 'HOVER_PREVIEW': {
                set({ hoverPreview: { player: payload.player, character_id: payload.character_id } })
                break
            }

            //── Select preview (global click sync) ─────────────────────────────
            case 'SELECT_PREVIEW': {
                set({ selectedPreview: { player: payload.player, character_id: payload.character_id } })
                break
            }

            default:
                console.log('[WS] Unhandled event:', event, payload)
        }
    },

    // ── Selectors (derived, called inline) ────────────────────────────────────

    /** True when it is myRole's turn to act in the draft. */
    isMyTurn: () => {
        const { draftSlots, myRole, phase } = get()
        if (!ACTIVE_DRAFT_PHASES.has(phase)) return false
        const current = draftSlots.find((s) => s.isCurrent)
        return current?.acting_player === myRole
    },

    /** The single current slot (next action needed). */
    currentSlot: () => get().draftSlots.find((s) => s.isCurrent) ?? null,
}))

export default useDraftStore
