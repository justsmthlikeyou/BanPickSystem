import { useState } from 'react'

/**
 * Premium Esports Form Input
 * Design tokens: #111318 surface, indigo-500 focus ring, 18px/22px padding, rounded-2xl
 */
export default function FormInput({
    label,
    type = 'text',
    value,
    onChange,
    placeholder,
    autoComplete,
    required = false,
    className = '',
    inputStyle = {},
}) {
    const [focused, setFocused] = useState(false)

    return (
        <fieldset className={`flex flex-col gap-2.5 ${className}`}>
            {label && (
                <label className="text-xs font-bold text-zinc-500 tracking-[0.15em] uppercase pl-1">
                    {label}
                </label>
            )}
            <input
                type={type}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                autoComplete={autoComplete}
                required={required}
                className="w-full rounded-2xl text-[16px] text-white outline-none transition-all duration-200 placeholder-zinc-700"
                style={{
                    padding: '18px 22px',
                    background: '#111318',
                    border: `1px solid ${focused ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.06)'}`,
                    boxShadow: focused ? '0 0 0 4px rgba(99,102,241,0.08)' : 'none',
                    ...inputStyle,
                }}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
            />
        </fieldset>
    )
}
