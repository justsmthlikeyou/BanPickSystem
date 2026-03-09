import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import useDraftStore from '../store/draftStore';
import { PHASE_LABELS } from '../store/draftStore';

const TEAM_SIZE = 4;

export default function TeamBuildingView() {
    const {
        draftSlots, charMap, myRole, freeChars, swapState,
        sendEvent, submitTeams, wsStatus
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
    // We derive the initial pool from draftSlots (picks only)
    const initialPicks = useMemo(() => {
        if (!isPlayer) return [];
        return (draftSlots || [])
            .filter(s => s && s.type === 'pick' && s.acting_player === myRole && s.isFilled)
            .map(s => s.character_id);
    }, [draftSlots, myRole, isPlayer]);

    // Track which characters are in which "area"
    const [pool, setPool] = useState([]);
    const [team1, setTeam1] = useState([]);
    const [team2, setTeam2] = useState([]);

    // Selection for Free Swap mechanic
    const [selectedForSwap, setSelectedForSwap] = useState(null);
    const [selectedFree, setSelectedFree] = useState(null);

    // Sync local state when picks or remote team state changes (e.g. on reconnect)
    useEffect(() => {
        const remoteT1 = swapState?.[`${myRole}_team1`] || [];
        const remoteT2 = swapState?.[`${myRole}_team2`] || [];

        // Any character in initialPicks that isn't in T1 or T2 goes to pool
        const assigned = new Set([...(Array.isArray(remoteT1) ? remoteT1 : []), ...(Array.isArray(remoteT2) ? remoteT2 : [])]);
        const initialPool = (initialPicks || []).filter(id => id && !assigned.has(id));

        setPool(initialPool);
        setTeam1(Array.isArray(remoteT1) ? remoteT1 : []);
        setTeam2(Array.isArray(remoteT2) ? remoteT2 : []);
    }, [initialPicks, myRole, swapState]);

    // ── Actions ──────────────────────────────────────────────────────────────

    const moveToTeam = (charId) => {
        if (team1.length < TEAM_SIZE) {
            setTeam1([...team1, charId]);
            setPool(pool.filter(id => id !== charId));
        } else if (team2.length < TEAM_SIZE) {
            setTeam2([...team2, charId]);
            setPool(pool.filter(id => id !== charId));
        }
    };

    const removeFromTeam = (charId, teamNum) => {
        if (teamNum === 1) {
            setTeam1(team1.filter(id => id !== charId));
        } else {
            setTeam2(team2.filter(id => id !== charId));
        }
        setPool([...pool, charId]);
    };

    const handleSwap = () => {
        if (!selectedForSwap || !selectedFree) return;
        sendEvent('SUBMIT_FREE_SWAP', {
            original_char_id: selectedForSwap,
            free_char_id: selectedFree
        });
        setSelectedForSwap(null);
        setSelectedFree(null);
    };

    const handlePass = () => {
        sendEvent('PLAYER_PASS_SWAP');
    };

    const handleLockTeams = () => {
        if (team1.length === TEAM_SIZE && team2.length === TEAM_SIZE) {
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

    console.log("Team Building Rendering with:", { pool, team1, team2, charMap: charMap ? Object.keys(charMap).length : 0, wsStatus });

    return (
        <div className="flex flex-col h-full w-full max-w-6xl mx-auto p-4 md:p-8 gap-8">
            <header className="flex flex-col md:flex-row items-center justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-bold tracking-tighter text-white">TEAM BUILDING</h2>
                    <p className="text-zinc-500 text-sm mt-1">Organize your 8 drafted characters into two teams of 4.</p>
                </div>

                <div className="flex items-center gap-3">
                    {!hasActed && (
                        <>
                            <button
                                onClick={handlePass}
                                className="px-6 py-2 rounded-xl border border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-white transition-all text-xs font-bold uppercase tracking-widest"
                            >
                                Pass Swap
                            </button>
                            <button
                                onClick={handleSwap}
                                disabled={!selectedForSwap || !selectedFree}
                                className="px-6 py-2 rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-600 hover:text-white transition-all text-xs font-bold uppercase tracking-widest disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                Confirm Swap
                            </button>
                        </>
                    )}
                    <button
                        onClick={handleLockTeams}
                        disabled={team1.length !== TEAM_SIZE || team2.length !== TEAM_SIZE || isLocked}
                        className={`px-8 py-3 rounded-xl font-bold uppercase tracking-[0.2em] text-sm transition-all shadow-lg ${isLocked
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/20 disabled:bg-zinc-800 disabled:text-zinc-600 disabled:shadow-none'
                            }`}
                    >
                        {isLocked ? 'Teams Locked ✓' : 'Lock Team Setup'}
                    </button>
                </div>
            </header>

            <main className="grid grid-cols-1 lg:grid-cols-2 gap-8 flex-1 min-h-0">
                {/* Left Side: Pool and Free selection */}
                <div className="flex flex-col gap-6">
                    <section className="bg-[#0f1117]/50 rounded-3xl p-6 border border-white/5 flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Drafted Pool</h3>
                            <span className="text-[10px] text-zinc-600">{pool.length} characters remaining</span>
                        </div>
                        <div className="grid grid-cols-4 gap-3">
                            <AnimatePresence mode="popLayout">
                                {(pool || []).map(id => (
                                    <CharacterCard
                                        key={id}
                                        char={charMap?.[id]}
                                        onClick={() => moveToTeam(id)}
                                        isSelected={selectedForSwap === id}
                                        onSelectForSwap={() => !hasActed && setSelectedForSwap(selectedForSwap === id ? null : id)}
                                        canSwap={!hasActed}
                                    />
                                ))}
                            </AnimatePresence>
                            {pool.length === 0 && (
                                <div className="col-span-4 py-8 flex items-center justify-center border-2 border-dashed border-zinc-800 rounded-2xl">
                                    <span className="text-zinc-700 text-xs font-medium uppercase tracking-widest italic">Pool Empty</span>
                                </div>
                            )}
                        </div>
                    </section>

                    {!hasActed && (
                        <section className="bg-indigo-950/20 rounded-3xl p-6 border border-indigo-500/10 flex flex-col gap-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Season Free Characters</h3>
                                <span className="text-[10px] text-indigo-600/60 font-medium uppercase tracking-tighter">Swap ONE drafted char</span>
                            </div>
                            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-zinc-800">
                                {(freeChars || []).map(char => (
                                    <FreeCharCard
                                        key={char?.id}
                                        char={char}
                                        isSelected={selectedFree === char?.id}
                                        onClick={() => setSelectedFree(selectedFree === char?.id ? null : char?.id)}
                                    />
                                ))}
                            </div>
                        </section>
                    )}
                </div>

                {/* Right Side: Teams */}
                <div className="flex flex-col gap-6">
                    <TeamSlotSection
                        label="TEAM 1 — FIRST HALF"
                        accent="indigo"
                        characters={team1}
                        charMap={charMap}
                        onRemove={(id) => removeFromTeam(id, 1)}
                        isLocked={isLocked}
                    />
                    <TeamSlotSection
                        label="TEAM 2 — SECOND HALF"
                        accent="purple"
                        characters={team2}
                        charMap={charMap}
                        onRemove={(id) => removeFromTeam(id, 2)}
                        isLocked={isLocked}
                    />
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

function FreeCharCard({ char, isSelected, onClick }) {
    return (
        <div
            onClick={onClick}
            className={`flex-shrink-0 cursor-pointer w-16 h-16 rounded-xl overflow-hidden border-2 transition-all ${isSelected ? 'border-indigo-400 ring-4 ring-indigo-400/20 animate-pulse' : 'border-zinc-800 grayscale opacity-50 hover:grayscale-0 hover:opacity-100'
                }`}
        >
            <img src={char?.icon_url} alt={char?.name} className="w-full h-full object-cover" />
        </div>
    );
}

function TeamSlotSection({ label, accent, characters, charMap, onRemove, isLocked }) {
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

            <div className="grid grid-cols-4 gap-4">
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
                                <img src={charMap?.[charId]?.icon_url} alt="Slot" className="w-full h-full object-cover" />
                            ) : (
                                <span className={`text-2xl font-bold opacity-10 ${textColor}`}>0{idx + 1}</span>
                            )}
                        </div>
                        {charId && (
                            <p className="text-[10px] font-bold text-center text-zinc-500 uppercase tracking-tighter truncate">
                                {charMap?.[charId]?.name}
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
