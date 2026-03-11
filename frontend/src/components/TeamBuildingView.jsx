import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import useDraftStore from '../store/draftStore';
import { PHASE_LABELS } from '../store/draftStore';
import seasonFreeCharacterNames from '../config/seasonFreeCharacters.json';

const TEAM_SIZE = 4;

export default function TeamBuildingView() {
    const {
        draftSlots, charMap, myRole, freeChars, swapState,
        sendEvent, submitTeams, wsStatus, phase
    } = useDraftStore();

    const isPlayer = myRole === 'player_a' || myRole === 'player_b';

    // ── ULTIMATE GUARD CLAUSE ──────────────────────────────────────────────────
    // If the websocket is reconnecting, or data is missing, we must NOT render the main UI
    // We check: is characters loaded? is session loaded? is ws open?
    const isDataLoaded = (draftSlots || []).length > 0 && charMap && Object.keys(charMap).length > 0;
    const isFullyReady = isDataLoaded && wsStatus === 'OPEN';

    if (isPlayer && !isFullyReady) {
        console.warn("[TeamBuilding] Rendering Guard Triggered", { isDataLoaded, wsStatus });
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-[#0d0e14]/90 backdrop-blur-md rounded-3xl m-8 border border-white/5 shadow-2xl min-h-[400px]">
                <div className="relative mb-8">
                    <div className="w-20 h-20 border-4 border-indigo-500/10 border-t-indigo-500 rounded-full animate-spin" />
                    <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-2xl animate-pulse">📡</span>
                    </div>
                </div>
                <h2 className="text-2xl font-bold text-white mb-2 uppercase tracking-[0.2em] font-display">Synchronizing Arena</h2>
                <p className="text-zinc-500 text-sm max-w-sm mx-auto leading-relaxed">
                    {wsStatus === 'RECONNECTING'
                        ? "Connection flickering... re-establishing link to the draft server."
                        : "Receiving battlefield data and character snapshots..."}
                </p>
                <div className="mt-8 flex gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce [animation-delay:-0.3s]" />
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce [animation-delay:-0.15s]" />
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce" />
                </div>
            </div>
        );
    }


    // ── Local State for interactive sorting ──────────────────────────────────
    // We derive the initial drafted pool from draftSlots (picks only)
    const initialPicks = useMemo(() => {
        if (!isPlayer) return [];
        return (draftSlots || [])
            .filter(s => s && s.type === 'pick' && s.acting_player === myRole && s.isFilled)
            .map(s => s.character_id);
    }, [draftSlots, myRole, isPlayer]);

    // Track which characters are in which slots
    const [team1, setTeam1] = useState([]);
    const [team2, setTeam2] = useState([]);
    const [hasInitialized, setHasInitialized] = useState(false);

    // Dynamic Pools: Calculate what is available based on what is NOT in team1 or team2
    const assignedIds = new Set([...(team1 || []), ...(team2 || [])]);
    const draftedPool = (initialPicks || []).filter(id => id && !assignedIds.has(id));
    
    // Resolve Season Free Character logical mapping (Names or String IDs -> Actual DB Integer IDs)
    const seasonFreeIds = useMemo(() => {
        if (!charMap || !seasonFreeCharacterNames) return [];
        return seasonFreeCharacterNames.map(identifier => {
            const char = Object.values(charMap).find(
                c => c.name === identifier || String(c.id) === String(identifier)
            );
            return char ? char.id : null;
        }).filter(Boolean); // removes any nulls if char isn't found
    }, [charMap]);

    // Season Free Pool based on static JSON
    const seasonFreePool = seasonFreeIds.filter(id => !assignedIds.has(id));

    // Sync local state when picks or remote team state changes (e.g. on reconnect)
    useEffect(() => {
        const myLocked = (swapState?.[`${myRole}_team1`] || []).length === TEAM_SIZE;

        // Reset check: if initialPicks is empty and we were previously initialized, clear everything.
        if (hasInitialized && (initialPicks || []).length === 0) {
            setTeam1([]);
            setTeam2([]);
            setHasInitialized(false);
            return;
        }

        // Strict Reset Guard: if the phase is NOT team_building, we must not have local state.
        if (phase !== 'team_building' && phase !== 'complete') {
            if (team1.length > 0 || team2.length > 0) {
                setTeam1([]);
                setTeam2([]);
                setHasInitialized(false);
            }
        }

        // We ONLY overwrite local state if:
        // 1. We haven't initialized yet
        // 2. We are already locked (this means we are rehydrating from the server's perspective of our final state)
        if (!hasInitialized || myLocked) {
            const remoteT1 = swapState?.[`${myRole}_team1`] || [];
            const remoteT2 = swapState?.[`${myRole}_team2`] || [];

            setTeam1(Array.isArray(remoteT1) ? remoteT1 : []);
            setTeam2(Array.isArray(remoteT2) ? remoteT2 : []);

            if (initialPicks.length > 0 || myLocked) {
                setHasInitialized(true);
            }
        }
    }, [initialPicks, myRole, swapState, hasInitialized, phase]);

    // ── Actions ──────────────────────────────────────────────────────────────

    const moveToTeam = (charId) => {
        if (team1.length < TEAM_SIZE) {
            setTeam1([...team1, charId]);
        } else if (team2.length < TEAM_SIZE) {
            setTeam2([...team2, charId]);
        }
    };

    const removeFromTeam = (charId, teamNum) => {
        if (teamNum === 1) {
            setTeam1(team1.filter(id => id !== charId));
        } else {
            setTeam2(team2.filter(id => id !== charId));
        }
    };

    const handleLockTeams = () => {
        if (team1.length === TEAM_SIZE && team2.length === TEAM_SIZE) {
            console.log("Mock Locking payload:", { team1, team2 });
            submitTeams(team1, team2);
        }
    };

    const hasActed = swapState?.hasActed;
    const isLocked = (swapState?.[`${myRole}_team1`]?.length === TEAM_SIZE);
    if (!isPlayer) {
        return (
            <CasterBuildingView
                swapState={swapState}
                charMap={charMap}
            />
        );
    }

    // Temporary explicit boundary log
    console.log("Team Building Rendering with:", { draftedPool, seasonFreePool, team1, team2, charMapKeys: charMap ? Object.keys(charMap).length : 0, wsStatus });

    const opponentRole = myRole === 'player_a' ? 'player_b' : 'player_a';
    const opponentLocked = (swapState?.[`${opponentRole}_team1`] || []).length === TEAM_SIZE;
    const bothLocked = isLocked && opponentLocked;

    return (
        <div className="flex flex-col h-full w-full max-w-[1400px] mx-auto p-4 md:p-6 gap-6 overflow-y-auto">
            <header className="flex flex-col md:flex-row items-center justify-between gap-4 bg-[#0d0e14]/60 backdrop-blur-xl p-6 rounded-3xl border border-white/5 shadow-2xl">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-2xl shadow-[0_0_20px_rgba(99,102,241,0.1)]">
                        🛠️
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold tracking-tight text-white uppercase italic">Arena Preparation</h2>
                        <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-[0.2em] mt-1">Both players are finalizing their team compositions</p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <button
                        onClick={handleLockTeams}
                        disabled={team1.length !== TEAM_SIZE || team2.length !== TEAM_SIZE || isLocked}
                        className={`px-8 py-3 rounded-xl font-black uppercase tracking-[0.2em] text-xs transition-all shadow-xl ${isLocked
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                            : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/40 disabled:bg-zinc-800/50 disabled:text-zinc-600 disabled:shadow-none translate-y-[-2px] active:translate-y-[0px]'
                            }`}
                    >
                        {isLocked ? '✓ Team Ready' : 'Lock Teams'}
                    </button>
                </div>
            </header>

            <main className="grid grid-cols-1 xl:grid-cols-2 gap-8 flex-1">
                {/* YOUR SIDE */}
                <div className="flex flex-col gap-6">
                    <div className="flex items-center justify-between px-2">
                        <div className="flex items-center gap-3">
                            <span className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]" />
                            <h3 className="text-sm font-black text-white uppercase tracking-[0.2em]">Your Configuration</h3>
                        </div>
                        <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">{isLocked ? 'Status: Formed' : 'Pending Selection'}</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-[#0d0e14]/40 p-6 rounded-[2rem] border border-white/5">
                        {/* Pool & Free */}
                        <div className="flex flex-col gap-6">
                            <section className="bg-black/20 rounded-2xl p-4 border border-white/5">
                                <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-4">Drafted Pool</h4>
                                <div className="grid grid-cols-4 gap-2">
                                    <AnimatePresence mode="popLayout">
                                        {(draftedPool || []).map(id => {
                                            if (!id) return null;
                                            return (
                                                <CharacterCard
                                                    key={`drafted-${id}`}
                                                    char={charMap?.[id]}
                                                    onClick={() => !isLocked && moveToTeam(id)}
                                                    canSwap={false}
                                                />
                                            );
                                        })}
                                    </AnimatePresence>
                                    {draftedPool.length === 0 && (
                                        <div className="col-span-4 aspect-video flex items-center justify-center border border-dashed border-zinc-800 rounded-xl">
                                            <span className="text-[10px] text-zinc-700 uppercase font-black tracking-widest italic">All Drafted Assigned</span>
                                        </div>
                                    )}
                                </div>
                            </section>

                            <section className="bg-indigo-500/5 rounded-2xl p-4 border border-indigo-500/10">
                                <h4 className="text-[10px] font-black text-indigo-400/60 uppercase tracking-widest mb-4">Season Free Pool</h4>
                                <div className="grid grid-cols-4 gap-2">
                                    <AnimatePresence mode="popLayout">
                                        {(seasonFreePool || []).map(id => {
                                            if (!id) return null;
                                            return (
                                                <CharacterCard
                                                    key={`free-${id}`}
                                                    char={charMap?.[id]}
                                                    onClick={() => !isLocked && moveToTeam(id)}
                                                    canSwap={false}
                                                />
                                            );
                                        })}
                                    </AnimatePresence>
                                    {(!seasonFreePool || seasonFreePool.length === 0) && (
                                        <div className="col-span-4 aspect-[3/1] flex items-center justify-center border border-dashed border-indigo-500/20 rounded-xl">
                                            <span className="text-[10px] text-indigo-400/40 uppercase font-black tracking-widest italic">All Free Assigned</span>
                                        </div>
                                    )}
                                </div>
                            </section>
                        </div>

                        {/* Teams Slots */}
                        <div className="flex flex-col gap-4">
                            <TeamSlotSection
                                label="First Half"
                                accent="indigo"
                                characters={team1 || []}
                                charMap={charMap}
                                onRemove={(id) => removeFromTeam(id, 1)}
                                isLocked={isLocked}
                                dense={true}
                            />
                            <TeamSlotSection
                                label="Second Half"
                                accent="purple"
                                characters={team2 || []}
                                charMap={charMap}
                                onRemove={(id) => removeFromTeam(id, 2)}
                                isLocked={isLocked}
                                dense={true}
                            />
                        </div>
                    </div>
                </div>

                {/* OPPONENT SIDE */}
                <div className="flex flex-col gap-6">
                    <div className="flex items-center justify-between px-2">
                        <div className="flex items-center gap-3">
                            <span className={`w-2 h-2 rounded-full ${opponentLocked ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-amber-500/50'}`} />
                            <h3 className="text-sm font-black text-white uppercase tracking-[0.2em]">Opponent Side</h3>
                        </div>
                        <span className={`text-[10px] font-bold uppercase tracking-widest ${opponentLocked ? 'text-emerald-400' : 'text-amber-500/40 animate-pulse'}`}>
                            {opponentLocked ? 'Status: Locked' : 'Status: Organizing...'}
                        </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-[#0d0e14]/40 p-6 rounded-[2rem] border border-white/5 relative">
                        {/* Left Column: Placeholder/Pool equivalents */}
                        <div className="flex flex-col gap-6">
                            {!opponentLocked ? (
                                <section className="bg-black/20 rounded-2xl p-4 border border-white/5 flex flex-col items-center justify-center min-h-[200px]">
                                    <div className="w-12 h-12 rounded-full border-2 border-amber-500/10 border-t-amber-500/40 animate-spin mb-4" />
                                    <p className="text-amber-400/30 text-[9px] font-black uppercase tracking-[0.2em] text-center max-w-[140px]">
                                        Strategy in Progress...
                                    </p>
                                </section>
                            ) : (
                                <section className="bg-emerald-500/5 rounded-2xl p-4 border border-emerald-500/10 flex flex-col items-center justify-center min-h-[200px]">
                                    <span className="text-2xl mb-2 opacity-20">🛡️</span>
                                    <p className="text-emerald-400/40 text-[9px] font-black uppercase tracking-[0.2em] text-center">
                                        Configuration Locked
                                    </p>
                                </section>
                            )}

                            {/* Decorative element to maintain symmetry with Free Characters section */}
                            <div className="hidden md:block h-24 bg-white/[0.02] rounded-2xl border border-white/[0.03] flex items-center justify-center">
                                <span className="text-[8px] font-black text-white/5 uppercase tracking-[0.4em] italic">Arena Intelligence</span>
                            </div>
                        </div>

                        {/* Right Column: Teams Slots */}
                        <div className="flex flex-col gap-4">
                            <TeamSlotSection
                                label="Opponent Team 1"
                                accent="zinc"
                                characters={swapState?.[`${opponentRole}_team1`] || []}
                                charMap={charMap}
                                isLocked={true}
                                isFogOfWar={!bothLocked}
                                dense={true}
                            />
                            <TeamSlotSection
                                label="Opponent Team 2"
                                accent="zinc"
                                characters={swapState?.[`${opponentRole}_team2`] || []}
                                charMap={charMap}
                                isLocked={true}
                                isFogOfWar={!bothLocked}
                                dense={true}
                            />

                            {!bothLocked && opponentLocked && (
                                <div className="mt-2 p-3 rounded-xl bg-indigo-500/5 border border-indigo-500/10 text-center">
                                    <p className="text-indigo-300/40 text-[8px] font-bold uppercase tracking-widest italic leading-relaxed">
                                        Confirm your teams <br /> to reveal choices
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}

function CharacterCard({ char, onClick, isSelected, onSelectForSwap, canSwap }) {
    if (!char) return null;
    return (
        <motion.div
            layout
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className={`relative group cursor-pointer aspect-[3/4] rounded-2xl overflow-hidden border-2 transition-all shadow-xl ${isSelected ? 'border-amber-400 ring-4 ring-amber-400/20' : 'border-white/5 hover:border-white/20'
                }`}
            onClick={onClick}
        >
            <img src={char?.icon_url} alt={char?.name} className="w-full h-full object-cover transition-transform group-hover:scale-110" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60" />

            {canSwap && (
                <button
                    onClick={(e) => { e.stopPropagation(); onSelectForSwap(); }}
                    className={`absolute top-2 right-2 p-1.5 rounded-lg backdrop-blur-md transition-all ${isSelected ? 'bg-amber-400 text-black' : 'bg-black/40 text-white/40 hover:text-white'
                        }`}
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                </button>
            )}

            <div className="absolute bottom-2 left-0 right-0 px-2">
                <p className="text-[10px] font-bold text-center text-white truncate drop-shadow-md">{char?.name}</p>
            </div>
        </motion.div>
    );
}

function TeamSlotSection({ label, accent, characters, charMap, onRemove, isLocked, dense, isFogOfWar }) {
    const slots = Array(TEAM_SIZE).fill(null);
    (characters || []).forEach((id, i) => {
        if (i < TEAM_SIZE) slots[i] = id;
    });

    const accentColor = accent === 'indigo' ? 'rgba(99,102,241,0.5)' : 'rgba(168,85,247,0.5)';
    const textColor = accent === 'indigo' ? 'text-indigo-400' : 'text-purple-400';

    return (
        <section className="bg-[#0f1117]/50 rounded-3xl p-6 border border-white/5 flex flex-col gap-5">
            <div className="flex items-center gap-3">
                <div className={`w-3 h-1.5 rounded-full ${accent === 'indigo' ? 'bg-indigo-500' : 'bg-purple-500'}`} />
                <h3 className={`text-xs font-bold uppercase tracking-widest ${textColor}`}>{label}</h3>
            </div>

            <div className={`grid grid-cols-4 ${dense ? 'gap-3' : 'gap-4'}`}>
                {slots.map((charId, idx) => (
                    <div key={idx} className="flex flex-col gap-2">
                        <div
                            className={`aspect-[3/4] rounded-2xl overflow-hidden flex items-center justify-center transition-all ${charId
                                ? 'border-2 border-white/10 ring-2 ring-white/5'
                                : `border-2 border-dashed border-zinc-800 bg-black/20 ${!isLocked && 'hover:bg-zinc-800/30'}`
                                }`}
                            onClick={() => charId && !isLocked && onRemove(charId)}
                            style={{
                                cursor: (charId && !isLocked) ? 'pointer' : 'default',
                                boxShadow: charId ? `0 8px 16px -4px rgba(0,0,0,0.4)` : 'none'
                            }}
                        >
                            {charId ? (
                                isFogOfWar ? (
                                    <div className="w-full h-full bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center relative overflow-hidden group">
                                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.05)_0%,transparent_100%)]" />
                                        <span className="text-3xl opacity-20 filter grayscale">❓</span>
                                        <div className="absolute inset-x-0 bottom-0 h-1 bg-white/5" />
                                    </div>
                                ) : (
                                    <img src={charMap?.[charId]?.icon_url} alt="Slot" className="w-full h-full object-cover" />
                                )
                            ) : (
                                <span className={`text-2xl font-bold opacity-10 ${textColor}`}>0{idx + 1}</span>
                            )}
                        </div>
                        {charId && (
                            <p className="text-[10px] font-bold text-center text-zinc-500 uppercase tracking-tighter truncate">
                                {isFogOfWar ? '???' : charMap?.[charId]?.name}
                            </p>
                        )}
                    </div>
                ))}
            </div>
        </section>
    );
}

function CasterBuildingView({ swapState, charMap }) {
    return (
        <div className="flex flex-col h-full w-full max-w-7xl mx-auto p-4 md:p-8 gap-8">
            <header className="text-center mb-4">
                <h2 className="text-4xl font-bold tracking-tighter text-white uppercase italic">Team Building Intelligence</h2>
                <p className="text-zinc-500 text-sm mt-2 font-medium tracking-widest uppercase">Live Arena Synchronization — Spectator Mode</p>
                <div className="w-24 h-1 bg-indigo-600 mx-auto mt-4 rounded-full shadow-[0_0_15px_rgba(79,70,229,0.5)]" />
            </header>

            <main className="grid grid-cols-1 xl:grid-cols-2 gap-12 flex-1">
                {/* Team A Side */}
                <CasterTeamSide
                    playerLabel="Team A (First Pick)"
                    playerKey="player_a"
                    teams={{
                        team1: swapState?.player_a_team1 || [],
                        team2: swapState?.player_a_team2 || []
                    }}
                    charMap={charMap}
                    accent="indigo"
                />

                {/* Team B Side */}
                <CasterTeamSide
                    playerLabel="Team B (Second Pick)"
                    playerKey="player_b"
                    teams={{
                        team1: swapState?.player_b_team1 || [],
                        team2: swapState?.player_b_team2 || []
                    }}
                    charMap={charMap}
                    accent="purple"
                />
            </main>
        </div>
    );
}

function CasterTeamSide({ playerLabel, playerKey, teams, charMap, accent }) {
    const isLocked = teams.team1.length === TEAM_SIZE && teams.team2.length === TEAM_SIZE;

    return (
        <motion.div
            initial={{ opacity: 0, x: playerKey === 'player_a' ? -20 : 20 }}
            animate={{ opacity: 1, x: 0 }}
            className={`flex flex-col gap-6 p-6 rounded-[2rem] bg-[#0d0e14]/40 border border-white/5 relative overflow-hidden`}
        >
            {/* Background Glow */}
            <div className={`absolute -top-24 -left-24 w-64 h-64 blur-[120px] rounded-full opacity-10 ${accent === 'indigo' ? 'bg-indigo-500' : 'bg-purple-500'}`} />

            <div className="flex items-center justify-between relative z-10 px-2">
                <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-2xl ${accent === 'indigo' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-purple-500/20 text-purple-400'}`}>
                        {playerKey === 'player_a' ? 'A' : 'B'}
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-white tracking-tight">{playerLabel}</h3>
                        <p className={`text-[10px] font-bold uppercase tracking-[0.2em] ${isLocked ? 'text-emerald-400' : 'text-amber-400/60'}`}>
                            {isLocked ? '✓ READY & LOCKED' : '⋯ Building Teams'}
                        </p>
                    </div>
                </div>
            </div>

            <div className="flex flex-col gap-6 relative z-10">
                {!isLocked ? (
                    <div className="flex-1 flex flex-col items-center justify-center py-20 bg-black/20 rounded-2xl border border-dashed border-white/5">
                        <div className={`w-12 h-12 rounded-full border-2 border-t-transparent animate-spin mb-4 ${accent === 'indigo' ? 'border-indigo-500/30 border-t-indigo-500' : 'border-purple-500/30 border-t-purple-500'}`} />
                        <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Waiting for {playerKey === 'player_a' ? 'Team A' : 'Team B'} to lock in...</p>
                    </div>
                ) : (
                    <>
                        <TeamSlotSection
                            label="TEAM 1 — FIRST HALF"
                            accent={accent}
                            characters={teams.team1}
                            charMap={charMap}
                            isLocked={true}
                        />
                        <TeamSlotSection
                            label="TEAM 2 — SECOND HALF"
                            accent={accent === 'indigo' ? 'purple' : 'indigo'} // Alternate accent for rows
                            characters={teams.team2}
                            charMap={charMap}
                            isLocked={true}
                        />
                    </>
                )}
            </div>
        </motion.div>
    );
}
