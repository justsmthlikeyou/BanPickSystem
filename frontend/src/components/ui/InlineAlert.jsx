import { motion } from 'framer-motion'

/**
 * Premium Esports Inline Alert (Error / Success)
 * Animated with Framer Motion. Use inside <AnimatePresence>.
 */
export default function InlineAlert({ type = 'error', children }) {
    const isError = type === 'error'

    return (
        <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8, height: 0 }}
            transition={{ duration: 0.25 }}
            className="rounded-2xl flex items-center gap-3"
            style={{
                padding: '16px 20px',
                background: isError ? 'rgba(239,68,68,0.06)' : 'rgba(34,197,94,0.06)',
                border: `1px solid ${isError ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)'}`,
                color: isError ? '#fca5a5' : '#86efac',
                fontSize: '14px',
                fontWeight: 500,
            }}
        >
            <span className="text-lg">{isError ? '⚠' : '✓'}</span>
            <span>{children}</span>
        </motion.div>
    )
}
