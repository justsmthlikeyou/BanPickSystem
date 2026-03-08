import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { authApi } from '../api/auth'
import useDraftStore from '../store/draftStore'

import FormInput from '../components/ui/FormInput'
import FormSelect from '../components/ui/FormSelect'
import PrimaryButton from '../components/ui/PrimaryButton'
import DraftTabToggle from '../components/ui/DraftTabToggle'
import InlineAlert from '../components/ui/InlineAlert'

/* ═══════════════════════════════════════════════════════════════════════════
   LoginPage — Premium Esports Full-Screen Split
   ═══════════════════════════════════════════════════════════════════════════ */

export default function LoginPage() {
    const navigate = useNavigate()
    const setIdentity = useDraftStore((s) => s.setIdentity)

    const [tab, setTab] = useState('login')
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [role, setRole] = useState('player')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [success, setSuccess] = useState(null)

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError(null)
        setSuccess(null)
        setLoading(true)
        try {
            if (tab === 'register') {
                await authApi.register(username, password, role)
                setSuccess('Account created — you can now sign in.')
                setTab('login')
            } else {
                await authApi.login(username, password)
                const { data: me } = await authApi.me()
                localStorage.setItem('username', me.username)
                localStorage.setItem('role', me.role)
                setIdentity(me.role, me.username)
                navigate('/')
            }
        } catch (err) {
            const detail = err.response?.data?.detail
            setError(typeof detail === 'string' ? detail : 'An error occurred. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    /* ── Render ────────────────────────────────────────────────────────────── */
    return (
        <div className="h-screen w-screen flex overflow-hidden" style={{ background: '#08090d' }}>

            {/* ── LEFT COLUMN: Form ───────────────────────────────────────────── */}
            <div className="w-full lg:w-1/2 h-full flex flex-col justify-center overflow-y-auto"
                style={{ padding: 'clamp(2rem, 5vw, 6rem) clamp(2rem, 6vw, 8rem)' }}>

                <motion.div
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                    className="w-full max-w-lg mx-auto flex flex-col"
                >
                    {/* Brand */}
                    <div className="flex items-center gap-4 mb-14">
                        <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                            style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.15)' }}>
                            <span className="text-2xl">⚔️</span>
                        </div>
                        <div>
                            <p className="font-bold text-indigo-400 text-sm tracking-[0.2em] uppercase leading-none">
                                Genshin Draft
                            </p>
                            <p className="text-zinc-600 text-xs tracking-widest uppercase mt-1"
                                style={{ fontFamily: 'Rajdhani, sans-serif' }}>
                                Spiral Abyss Tournament
                            </p>
                        </div>
                    </div>

                    {/* Headline */}
                    <h1 className="text-5xl lg:text-[3.5rem] font-bold text-white tracking-tight mb-3"
                        style={{ fontFamily: 'Rajdhani, sans-serif', lineHeight: 1.1 }}>
                        {tab === 'login' ? 'Welcome Back.' : 'Join the Arena.'}
                    </h1>
                    <p className="text-zinc-500 text-lg mb-12 max-w-sm leading-relaxed">
                        {tab === 'login'
                            ? 'Sign in to access the tournament draft room.'
                            : 'Create your account and start competing.'}
                    </p>

                    {/* Tab Toggle */}
                    <DraftTabToggle
                        tabs={[
                            { key: 'login', label: 'Sign In' },
                            { key: 'register', label: 'Register' },
                        ]}
                        activeTab={tab}
                        onTabChange={(t) => { setTab(t); setError(null); setSuccess(null) }}
                        className="mb-10"
                    />

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="flex flex-col gap-7">

                        <FormInput
                            label="Username"
                            value={username}
                            onChange={setUsername}
                            placeholder="e.g. Traveler"
                            autoComplete="username"
                            required
                        />

                        <FormInput
                            label="Password"
                            type="password"
                            value={password}
                            onChange={setPassword}
                            placeholder="••••••••"
                            autoComplete="current-password"
                            required
                            inputStyle={{ letterSpacing: '0.15em' }}
                        />

                        {/* Role (register only) */}
                        <AnimatePresence>
                            {tab === 'register' && (
                                <motion.div
                                    key="role-field"
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    transition={{ duration: 0.25 }}
                                    className="overflow-hidden"
                                >
                                    <FormSelect
                                        label="Account Role"
                                        value={role}
                                        onChange={setRole}
                                        options={[
                                            { value: 'player', label: 'Tournament Player' },
                                            { value: 'admin', label: 'Admin / Commentator' },
                                        ]}
                                    />
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Error / Success messages */}
                        <AnimatePresence>
                            {error && <InlineAlert key="err" type="error">{error}</InlineAlert>}
                            {success && <InlineAlert key="ok" type="success">{success}</InlineAlert>}
                        </AnimatePresence>

                        {/* Submit */}
                        <PrimaryButton type="submit" loading={loading} className="mt-4">
                            {loading
                                ? 'Authenticating...'
                                : tab === 'login' ? 'SIGN IN' : 'CREATE ACCOUNT'}
                        </PrimaryButton>
                    </form>

                    {/* Footer */}
                    <div className="mt-16 flex items-center justify-between text-zinc-700 text-xs tracking-widest uppercase font-bold">
                        <span>Season 1</span>
                        <span>v2.0</span>
                    </div>
                </motion.div>
            </div>

            {/* ── RIGHT COLUMN: Graphic ───────────────────────────────────────── */}
            <div className="hidden lg:block lg:w-1/2 h-full relative overflow-hidden">
                <img
                    src="https://wallpapercave.com/wp/wp12816653.jpg"
                    alt="Images Patch 6.4"
                    className="absolute inset-0 w-full h-full object-cover"
                    style={{ opacity: 0.55 }}
                />
                {/* Left fade into form bg */}
                <div className="absolute inset-0 pointer-events-none"
                    style={{ background: 'linear-gradient(to right, #08090d 0%, rgba(8,9,13,0.7) 25%, transparent 60%)' }} />
                {/* Bottom fade */}
                <div className="absolute inset-0 pointer-events-none"
                    style={{ background: 'linear-gradient(to top, #08090d 0%, transparent 40%)' }} />
                {/* Top vignette */}
                <div className="absolute inset-0 pointer-events-none"
                    style={{ background: 'linear-gradient(to bottom, rgba(8,9,13,0.4) 0%, transparent 30%)' }} />

                {/* Bottom-right label */}
                <div className="absolute bottom-12 right-12 z-10 text-right">
                    <p className="text-white/25 text-xs font-bold tracking-[0.25em] uppercase">
                        Teyvat Championship Series
                    </p>
                </div>
            </div>
        </div>
    )
}
