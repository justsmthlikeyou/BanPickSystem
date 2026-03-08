import { useEffect, useRef, useCallback } from 'react'
import useDraftStore from '../store/draftStore'

const MAX_RETRIES = 1
const BASE_RETRY_DELAY_MS = 2000

/**
 * useWebSocket — manages the WebSocket lifecycle for a draft room.
 *
 * @param {string|null} roomCode - The room to connect to. Pass null to skip.
 * @param {string}      role     - 'player_a' | 'player_b' | 'admin'
 *
 * Automatically:
 *  - Connects on mount / reconnects on roomCode change
 *  - Routes all inbound messages to draftStore.handleWsEvent()
 *  - Exposes wsRef on the store so sendEvent() works
 *  - Retries up to MAX_RETRIES times on unclean disconnect
 *  - Closes cleanly on unmount
 */
export function useWebSocket(roomCode, role) {
    const wsRef = useRef(null)
    const retryCount = useRef(0)
    const retryTimer = useRef(null)
    const pingTimer = useRef(null)
    const lastEventHash = useRef(null)

    const handleWsEvent = useDraftStore((s) => s.handleWsEvent)
    const setWsRef = useDraftStore((s) => s.setWsRef)
    const setWsStatus = useDraftStore((s) => s.setWsStatus)

    const connect = useCallback(() => {
        if (!roomCode || !role) return
        const token = localStorage.getItem('token')
        if (!token) return

        // Read WS URL from env, or fallback to dev localhost matching current protocol/host
        const isProd = import.meta.env.PROD;
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

        let basePath = import.meta.env.VITE_WS_URL;
        if (!basePath) {
            basePath = isProd ? window.location.host : 'localhost:8000';
        }

        // Remove trailing slash if present
        basePath = basePath.replace(/\/+$/, '');

        const wsUrl = `${wsProtocol}//${basePath}/ws/${roomCode}?token=${token}&role=${role}`

        const ws = new WebSocket(wsUrl)
        wsRef.current = ws
        setWsRef(ws)

        ws.onopen = () => {
            console.log(`[WS] Connected to room ${roomCode} as ${role}`)
            retryCount.current = 0
            setWsStatus('OPEN')

            // Immediately explicitly request SYNC_STATE
            ws.send(JSON.stringify({ event: 'SYNC_STATE' }))

            // Start heartbeat ping
            clearInterval(pingTimer.current)
            pingTimer.current = setInterval(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ event: 'PING' }))
                }
            }, 20000) // Every 20s to avoid 30s timeouts
        }

        ws.onmessage = (evt) => {
            try {
                const msg = JSON.parse(evt.data)

                // Event Deduplication: Prevent multiple identical broadcast renders
                if (msg.event === 'TURN_CHANGED' || msg.event === 'PHASE_CHANGED') {
                    const currentHash = JSON.stringify(msg)
                    if (lastEventHash.current === currentHash) {
                        console.warn('[WS] Ignored duplicate event:', msg.event)
                        return
                    }
                    lastEventHash.current = currentHash
                }

                handleWsEvent(msg)
            } catch (e) {
                console.error('[WS] Failed to parse message:', e)
            }
        }

        ws.onerror = (err) => {
            console.error('[WS] Error:', err)
        }

        ws.onclose = (evt) => {
            console.warn(`[WS] Closed — code ${evt.code}, clean: ${evt.wasClean}`)
            clearInterval(pingTimer.current)
            setWsRef(null)
            setWsStatus('CLOSED')
            wsRef.current = null

            // Reconnect on unclean close (e.g. ECONNABORTED network blip)
            if (!evt.wasClean && retryCount.current < MAX_RETRIES) {
                retryCount.current += 1
                setWsStatus('RECONNECTING')
                useDraftStore.getState().resetState()
                console.log(`[WS] Connection lost. Attempting ONE clean reconnection in 2 seconds...`)
                retryTimer.current = setTimeout(connect, BASE_RETRY_DELAY_MS)
            }
        }
    }, [roomCode, role, handleWsEvent, setWsRef])

    useEffect(() => {
        connect()
        return () => {
            // Clean up on unmount
            clearTimeout(retryTimer.current)
            clearInterval(pingTimer.current)
            if (wsRef.current) {
                wsRef.current.onclose = null   // Prevent reconnect loop on intentional close
                wsRef.current.close(1000, 'component unmounted')
            }
            setWsRef(null)
        }
    }, [connect])
}
