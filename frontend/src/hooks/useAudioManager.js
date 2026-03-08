import { useState, useEffect, useRef, useCallback } from 'react'
import useDraftStore from '../store/draftStore'

/**
 * Custom audio manager that seamlessly crossfades between tracks
 * based on the current draft phase.
 */
export function useAudioManager() {
    const phase = useDraftStore((s) => s.phase)

    const [isMuted, setIsMuted] = useState(localStorage.getItem('draft_muted') === 'true')
    const [masterVolume, setMasterVolume] = useState(parseFloat(localStorage.getItem('draft_volume') || '0.3'))
    const [audioAllowed, setAudioAllowed] = useState(false) // Unlocked on first user interaction

    // Two audio instances to allow cross-fading
    const audioARef = useRef(new Audio())
    const audioBRef = useRef(new Audio())
    const activeAudioRef = useRef('A') // Tracks which audio tag is currently primary
    const fadeIntervalRef = useRef(null)
    const activeTrackRef = useRef(null)

    // Ensure audio loops
    useEffect(() => {
        audioARef.current.loop = true
        audioBRef.current.loop = true
    }, [])

    // Unlock audio context on any click
    useEffect(() => {
        const handleInteraction = () => {
            if (!audioAllowed) {
                setAudioAllowed(true)
                // Browsers often require an explicit .play() during the trusted event
                audioARef.current.play().catch(() => { })
                audioARef.current.pause()
                audioBRef.current.play().catch(() => { })
                audioBRef.current.pause()
            }
        }
        document.addEventListener('click', handleInteraction, { once: true })
        return () => document.removeEventListener('click', handleInteraction)
    }, [audioAllowed])

    // Save volume/mute prefs
    useEffect(() => {
        localStorage.setItem('draft_muted', isMuted)
        localStorage.setItem('draft_volume', masterVolume)

        // Immediately apply raw volume if not currently cross-fading
        if (!fadeIntervalRef.current) {
            const activeAud = activeAudioRef.current === 'A' ? audioARef.current : audioBRef.current
            activeAud.volume = isMuted ? 0 : masterVolume
        }
    }, [isMuted, masterVolume])

    // Core logic: Phase -> Track URL mapping
    useEffect(() => {
        if (!audioAllowed) return

        let targetTrack = null
        if (phase === 'waiting' || phase === 'coin_toss') {
            targetTrack = '/audio/waiting.mp3'
        } else if (phase.includes('ban') || phase.includes('pick') || phase === 'team_building') {
            targetTrack = '/audio/drafting.mp3'
        } else if (phase === 'complete') {
            targetTrack = '/audio/complete.mp3'
        }

        if (targetTrack === activeTrackRef.current) return // Already playing/fading to this track
        activeTrackRef.current = targetTrack

        const currentAud = activeAudioRef.current === 'A' ? audioARef.current : audioBRef.current
        const nextAud = activeAudioRef.current === 'A' ? audioBRef.current : audioARef.current

        // Swap active tracker
        activeAudioRef.current = activeAudioRef.current === 'A' ? 'B' : 'A'

        if (targetTrack) {
            nextAud.src = targetTrack
            nextAud.volume = 0
            if (!isMuted) {
                nextAud.play().catch(e => console.warn('Audio play prevented:', e))
            }
        }

        // Crossfade logic
        clearInterval(fadeIntervalRef.current)
        if (isMuted) {
            currentAud.pause()
            return
        }

        const FADE_DURATION = 2000 // 2 seconds
        const STEPS = 20
        const stepTime = FADE_DURATION / STEPS
        const currentStartVol = currentAud.volume
        const targetVol = masterVolume

        let step = 0
        fadeIntervalRef.current = setInterval(() => {
            step++
            const progress = step / STEPS

            // Fade out old
            if (currentStartVol > 0) {
                currentAud.volume = Math.max(0, currentStartVol * (1 - progress))
            }

            // Fade in new
            if (targetTrack) {
                nextAud.volume = Math.min(targetVol, targetVol * progress)
            }

            if (step >= STEPS) {
                clearInterval(fadeIntervalRef.current)
                fadeIntervalRef.current = null
                currentAud.pause()
                currentAud.volume = 0 // Fully reset old track
            }
        }, stepTime)

    }, [phase, audioAllowed, masterVolume, isMuted])

    const toggleMute = useCallback(() => setIsMuted(m => !m), [])
    const handleVolumeChange = useCallback((val) => {
        setMasterVolume(val)
        if (val > 0 && isMuted) setIsMuted(false)
    }, [isMuted])

    return {
        isMuted,
        masterVolume,
        toggleMute,
        handleVolumeChange
    }
}
