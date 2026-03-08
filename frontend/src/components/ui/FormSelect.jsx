import { useState } from 'react'

/**
 * Premium Esports Form Select
 * Matches FormInput design tokens exactly.
 */
export default function FormSelect({
    label,
    value,
    onChange,
    options = [],
    className = '',
}) {
    const [focused, setFocused] = useState(false)

    return (
        <fieldset className={`flex flex-col gap-2.5 ${className}`}>
            {label && (
                <label className="text-xs font-bold text-zinc-500 tracking-[0.15em] uppercase pl-1">
                    {label}
                </label>
            )}
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-full rounded-2xl text-[16px] text-white outline-none transition-all duration-200 appearance-none cursor-pointer"
                style={{
                    padding: '18px 22px',
                    background: '#111318',
                    border: `1px solid ${focused ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.06)'}`,
                    boxShadow: focused ? '0 0 0 4px rgba(99,102,241,0.08)' : 'none',
                }}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
            >
                {options.map((opt) => (
                    <option key={opt.value} value={opt.value} style={{ background: '#08090d' }}>
                        {opt.label}
                    </option>
                ))}
            </select>
        </fieldset>
    )
}
