/**
 * Premium Esports Tab Toggle (Pill Switcher)
 * Design tokens: #111318 surface, indigo-500 active, rounded-2xl container, rounded-xl pills
 */
export default function DraftTabToggle({
    tabs,           // [{ key: 'login', label: 'Sign In' }, ...]
    activeTab,
    onTabChange,
    className = '',
}) {
    return (
        <div
            className={`flex gap-1 p-1.5 rounded-2xl ${className}`}
            style={{ background: '#111318', border: '1px solid rgba(255,255,255,0.04)' }}
        >
            {tabs.map((tab) => (
                <button
                    key={tab.key}
                    type="button"
                    onClick={() => onTabChange(tab.key)}
                    className="flex-1 py-3.5 rounded-xl text-base font-bold transition-all duration-300"
                    style={{
                        fontFamily: 'Rajdhani, sans-serif',
                        letterSpacing: '0.06em',
                        cursor: 'pointer',
                        border: 'none',
                        background: activeTab === tab.key ? '#6366f1' : 'transparent',
                        color: activeTab === tab.key ? 'white' : '#52525b',
                        boxShadow: activeTab === tab.key ? '0 4px 20px -4px rgba(99,102,241,0.4)' : 'none',
                    }}
                >
                    {tab.label}
                </button>
            ))}
        </div>
    )
}
