import React from 'react'

export default function AudioController({ isMuted, masterVolume, toggleMute, handleVolumeChange }) {
    return (
        <div className="flex items-center gap-3"
            style={{
                background: 'rgba(255,255,255,0.03)',
                padding: '6px 10px',
                borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.06)'
            }}
        >
            <button
                type="button"
                onClick={toggleMute}
                className="text-zinc-400 hover:text-white transition-colors"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                title={isMuted ? "Unmute" : "Mute"}
            >
                {isMuted ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                        <line x1="23" y1="9" x2="17" y2="15" />
                        <line x1="17" y1="9" x2="23" y2="15" />
                    </svg>
                ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                        <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                    </svg>
                )}
            </button>
            <input
                type="range"
                className="w-20 accent-indigo-500 bg-zinc-800 rounded-lg h-1"
                min="0" max="1" step="0.01"
                value={isMuted ? 0 : masterVolume}
                onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                style={{ cursor: 'pointer' }}
            />
        </div>
    )
}
