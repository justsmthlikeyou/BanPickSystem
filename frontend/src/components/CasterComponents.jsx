import { motion, AnimatePresence } from 'framer-motion'
import PrimaryButton from './ui/PrimaryButton'

/* ═══════════════════════════════════════════════════════════════════════════
   CasterTeamColumn — Vertical 25% sidebar with ban + pick slots
   ═══════════════════════════════════════════════════════════════════════════ */

export function CasterTeamColumn({ label, player, accentColor, side, slots, charMap, currentSlot }) {
    const playerSlots = slots.filter((s) => s.acting_player === player)
    const banSlots = playerSlots.filter((s) => s.type === 'ban')
    const pickSlots = playerSlots.filter((s) => s.type === 'pick')

    return (
        <div className="w-[25%] h-full flex flex-col overflow-hidden flex-shrink-0"
            style={{
                background: '#0a0b10',
                borderRight: side === 'left' ? '1px solid rgba(255,255,255,0.03)' : 'none',
                borderLeft: side === 'right' ? '1px solid rgba(255,255,255,0.03)' : 'none',
            }}>
            {/* Header */}
            <div className="flex items-center gap-2.5 px-4 py-4 flex-shrink-0"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: accentColor }} />
                <span className="text-xs font-bold tracking-[0.2em] uppercase" style={{ color: accentColor }}>
                    {label}
                </span>
            </div>

            {/* Bans */}
            <div className="px-3 pt-3 pb-1 flex-shrink-0">
                <p className="text-[9px] text-zinc-700 font-bold tracking-[0.2em] uppercase mb-2 px-1">BANS</p>
                <div className="flex gap-2">
                    {banSlots.map((slot) => (
                        <CasterSlot key={slot.seq} slot={slot} charMap={charMap} isCurrent={currentSlot?.seq === slot.seq} isBan />
                    ))}
                </div>
            </div>

            {/* Divider */}
            <div className="mx-3 my-2" style={{ height: 1, background: 'rgba(255,255,255,0.04)' }} />

            {/* Picks */}
            <div className="px-3 pt-1 pb-3 flex-1 overflow-y-auto">
                <p className="text-[9px] text-zinc-700 font-bold tracking-[0.2em] uppercase mb-2 px-1">PICKS</p>
                <div className="flex flex-col gap-2">
                    {pickSlots.map((slot) => (
                        <CasterSlot key={slot.seq} slot={slot} charMap={charMap} isCurrent={currentSlot?.seq === slot.seq} isBan={false} />
                    ))}
                </div>
            </div>
        </div>
    )
}


/* ═══════════════════════════════════════════════════════════════════════════
   CasterSlot — Individual pick/ban card for the caster column
   ═══════════════════════════════════════════════════════════════════════════ */

function CasterSlot({ slot, charMap, isCurrent, isBan }) {
    const char = slot.isFilled ? charMap[slot.character_id] : null
    const isFilled = slot.isFilled

    const banBorder = isFilled ? 'rgba(239,68,68,0.2)' : isCurrent ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.04)'
    const pickBorder = isFilled ? `${isCurrent ? 'rgba(99,102,241,0.4)' : 'rgba(99,102,241,0.15)'}` : isCurrent ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.04)'

    return (
        <motion.div
            layout
            className={`relative overflow-hidden transition-all duration-300 ${isBan ? 'flex-1' : 'w-full'}`}
            style={{
                height: isBan ? 48 : 56,
                borderRadius: isBan ? 12 : 14,
                background: isFilled ? '#111318' : '#0d0e14',
                border: `${isCurrent ? '2px' : '1px'} solid ${isBan ? banBorder : pickBorder}`,
                boxShadow: isCurrent ? `0 0 16px ${isBan ? 'rgba(239,68,68,0.1)' : 'rgba(99,102,241,0.12)'}` : 'none',
            }}
        >
            {isFilled ? (
                slot.character_id === null ? (
                    <div className="flex items-center justify-center h-full bg-zinc-800/80 rounded-lg m-1" style={{ border: '1px dashed rgba(239,68,68,0.3)' }}>
                        <span className="text-red-500 font-bold text-[10px] tracking-widest uppercase flex items-center gap-2">
                            <span className="text-sm">✕</span> SKIPPED
                        </span>
                    </div>
                ) : (
                    <div className="flex items-center gap-3 h-full px-3">
                        <div className="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0" style={{ background: '#191c24' }}>
                            {char?.icon_url && (
                                <img src={char.icon_url} alt={char.name} className="w-full h-full object-cover"
                                    style={{ filter: isBan ? 'grayscale(80%)' : 'none', opacity: isBan ? 0.5 : 1 }} />
                            )}
                        </div>
                        <span className="text-xs font-bold tracking-wider truncate"
                            style={{ color: isBan ? '#71717a' : '#e4e4e7', textDecoration: isBan ? 'line-through' : 'none' }}>
                            {char?.name ?? '—'}
                        </span>
                        {isBan && (
                            <span className="ml-auto text-red-500/50 text-sm font-bold">✕</span>
                        )}
                    </div>
                )
            ) : (
                <div className="flex items-center justify-center h-full">
                    <span className={`text-[10px] font-bold tracking-widest uppercase ${isCurrent ? 'animate-pulse' : ''}`}
                        style={{ color: isCurrent ? (isBan ? '#f87171' : '#818cf8') : '#27272a' }}>
                        {isCurrent ? (isBan ? 'BANNING...' : 'PICKING...') : `#${slot.seq}`}
                    </span>
                </div>
            )}
            {isCurrent && (
                <div className="absolute inset-0 rounded-xl animate-pulse pointer-events-none"
                    style={{ border: `2px solid ${isBan ? 'rgba(239,68,68,0.3)' : 'rgba(99,102,241,0.3)'}` }} />
            )}
        </motion.div>
    )
}


/* ═══════════════════════════════════════════════════════════════════════════
   CasterSpotlight — Cinematic center with character art + lock-in effects
   ═══════════════════════════════════════════════════════════════════════════ */

export function CasterSpotlight({ previewChar, curSlot, hoverPreview, lastAction, selectedCharId, isActiveDraft, handleAdminForceConfirm }) {
    return (
        <div className="flex-1 relative overflow-hidden flex flex-col">
            {/* Background art */}
            <AnimatePresence mode="wait">
                {previewChar?.splash_art_url ? (
                    <motion.img key={`spot-${previewChar.id}`}
                        src={previewChar.splash_art_url} alt={previewChar.name}
                        initial={{ opacity: 0, scale: 1.15, filter: 'blur(8px)' }}
                        animate={{ opacity: 0.5, scale: 1, filter: 'blur(0px)' }}
                        exit={{ opacity: 0, scale: 0.95, filter: 'blur(4px)' }}
                        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                        className="absolute inset-0 w-full h-full object-cover"
                    />
                ) : (
                    <motion.div key="spot-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        className="absolute inset-0 flex items-center justify-center">
                        <div className="text-center">
                            <span className="text-8xl opacity-[0.03]">⚔️</span>
                            <p className="text-zinc-800 text-sm mt-6 tracking-[0.3em] uppercase font-bold">
                                Watching draft...
                            </p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Gradient overlays */}
            <div className="absolute inset-0 pointer-events-none"
                style={{ background: 'linear-gradient(to right, #0a0b10 0%, transparent 25%)' }} />
            <div className="absolute inset-0 pointer-events-none"
                style={{ background: 'linear-gradient(to left, #0a0b10 0%, transparent 25%)' }} />
            <div className="absolute inset-0 pointer-events-none"
                style={{ background: 'linear-gradient(to top, #08090d 0%, transparent 40%)' }} />
            <div className="absolute inset-0 pointer-events-none"
                style={{ background: 'linear-gradient(to bottom, rgba(8,9,13,0.6) 0%, transparent 20%)' }} />

            {/* Lock-in flash */}
            <AnimatePresence>
                {lastAction && (
                    <motion.div key={`caster-lock-flash-${lastAction.sequence_num}`}
                        initial={{ opacity: 0.9 }} animate={{ opacity: 0 }} exit={{ opacity: 0 }}
                        transition={{ duration: 2 }}
                        className="absolute inset-0 pointer-events-none z-10"
                        style={{
                            background: lastAction.action_type === 'ban'
                                ? 'radial-gradient(ellipse at center, rgba(239,68,68,0.25) 0%, transparent 65%)'
                                : 'radial-gradient(ellipse at center, rgba(99,102,241,0.25) 0%, transparent 65%)',
                        }}
                    />
                )}
            </AnimatePresence>

            {/* "LOCKING IN..." pulse when player has selected */}
            <AnimatePresence>
                {selectedCharId && previewChar && isActiveDraft && (
                    <motion.div
                        key="locking-pulse"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: [0.3, 0.6, 0.3] }}
                        transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
                        className="absolute inset-0 pointer-events-none z-10"
                        style={{
                            background: curSlot?.type === 'ban'
                                ? 'radial-gradient(ellipse at center, rgba(239,68,68,0.08) 0%, transparent 60%)'
                                : 'radial-gradient(ellipse at center, rgba(99,102,241,0.08) 0%, transparent 60%)',
                        }}
                    />
                )}
            </AnimatePresence>

            {/* Character info + admin force button */}
            <div className="mt-auto relative z-20 p-8">
                <AnimatePresence mode="wait">
                    {previewChar && (
                        <motion.div key={`cspot-${previewChar.id}`}
                            initial={{ opacity: 0, y: 24 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 12 }}
                            transition={{ duration: 0.35 }}
                            className="text-center"
                        >
                            {/* Hover indicator */}
                            {hoverPreview?.character_id === previewChar.id && (
                                <p className="text-[10px] font-bold tracking-[0.2em] uppercase mb-2"
                                    style={{ color: '#fbbf24' }}>
                                    {hoverPreview.player === 'player_a' ? 'TEAM A' : 'TEAM B'} PREVIEWING
                                </p>
                            )}

                            <h2 className="text-5xl font-bold text-white mb-6"
                                style={{
                                    fontFamily: 'Rajdhani, sans-serif',
                                    textShadow: `0 0 40px ${curSlot?.type === 'ban' ? 'rgba(239,68,68,0.2)' : 'rgba(99,102,241,0.2)'}`,
                                }}>
                                {previewChar.name}
                            </h2>

                            {/* LOCKING IN text */}
                            {selectedCharId && (
                                <motion.p
                                    animate={{ opacity: [0.5, 1, 0.5] }}
                                    transition={{ repeat: Infinity, duration: 1.2 }}
                                    className="text-sm font-bold tracking-[0.3em] uppercase mb-6"
                                    style={{ color: curSlot?.type === 'ban' ? '#f87171' : '#818cf8' }}
                                >
                                    LOCKING IN...
                                </motion.p>
                            )}

                            {/* Admin force button */}
                            {selectedCharId && isActiveDraft && (
                                <div className="flex justify-center">
                                    <PrimaryButton onClick={handleAdminForceConfirm} variant="ghost" className="max-w-xs">
                                        ⚡ FORCE {curSlot?.type === 'ban' ? 'BAN' : 'PICK'}
                                    </PrimaryButton>
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    )
}


/* ═══════════════════════════════════════════════════════════════════════════
   CompleteSummary — Shared draft-complete view
   ═══════════════════════════════════════════════════════════════════════════ */

export function CompleteSummary({ finalTeams, charMap, navigate }) {
    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="text-center w-full max-w-2xl">
            <h2 className="text-3xl font-bold text-white mb-8" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
                Draft Complete ✓
            </h2>
            {finalTeams && (
                <div className="flex gap-6">
                    {['player_a', 'player_b'].map((player) => (
                        <div key={player} className="flex-1 rounded-2xl p-6"
                            style={{ background: '#111318', border: '1px solid rgba(255,255,255,0.04)' }}>
                            <p className="text-xs font-bold tracking-[0.2em] uppercase mb-4"
                                style={{ color: player === 'player_a' ? '#818cf8' : '#a78bfa' }}>
                                {player === 'player_a' ? 'Team A' : 'Team B'}
                            </p>
                            <div className="grid grid-cols-4 gap-2">
                                {(finalTeams[player]?.picks ?? []).map((cid) => {
                                    const ch = charMap[cid]
                                    return (
                                        <div key={cid} className="flex flex-col items-center gap-1">
                                            <div className="w-12 h-12 rounded-xl overflow-hidden"
                                                style={{ background: '#191c24', border: '1px solid rgba(255,255,255,0.06)' }}>
                                                {ch?.icon_url && <img src={ch.icon_url} alt={ch.name} className="w-full h-full object-cover" />}
                                            </div>
                                            <span className="text-[10px] text-zinc-500 truncate w-full text-center">{ch?.name ?? '?'}</span>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}
            <button onClick={() => navigate('/')}
                className="mt-8 mx-auto px-12 py-4 rounded-2xl text-sm font-bold tracking-[0.15em] uppercase transition-all duration-300"
                style={{
                    background: 'rgba(99,102,241,0.08)',
                    border: '1px solid rgba(99,102,241,0.15)',
                    color: '#a5b4fc',
                    cursor: 'pointer',
                }}>
                BACK TO LOBBY
            </button>
        </motion.div>
    )
}
