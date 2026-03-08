import { motion } from 'framer-motion'

/**
 * Premium Esports Primary Button
 * Design tokens: indigo-500 bg, 20px padding, rounded-2xl, glow shadow, Rajdhani font
 */
export default function PrimaryButton({
    children,
    type = 'button',
    onClick,
    loading = false,
    disabled = false,
    className = '',
    variant = 'primary', // 'primary' | 'ghost'
}) {
    const isDisabled = loading || disabled
    const isPrimary = variant === 'primary'

    return (
        <motion.button
            type={type}
            onClick={onClick}
            disabled={isDisabled}
            whileHover={!isDisabled ? { scale: 1.015 } : {}}
            whileTap={!isDisabled ? { scale: 0.985 } : {}}
            className={`w-full rounded-2xl font-bold transition-all duration-300 ${className}`}
            style={{
                padding: '20px',
                fontSize: '17px',
                fontFamily: 'Rajdhani, sans-serif',
                letterSpacing: '0.06em',
                background: isDisabled
                    ? '#1e1e2e'
                    : isPrimary
                        ? '#6366f1'
                        : 'rgba(99,102,241,0.08)',
                border: isPrimary ? 'none' : '1px solid rgba(99,102,241,0.15)',
                color: isPrimary ? 'white' : '#a5b4fc',
                cursor: isDisabled ? 'not-allowed' : 'pointer',
                opacity: isDisabled ? 0.6 : 1,
                boxShadow: isDisabled
                    ? 'none'
                    : isPrimary
                        ? '0 6px 30px -6px rgba(99,102,241,0.45)'
                        : 'none',
            }}
        >
            {children}
        </motion.button>
    )
}
