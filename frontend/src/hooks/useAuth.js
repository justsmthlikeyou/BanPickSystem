/**
 * useAuth — reads/writes identity from localStorage.
 * Keeps it simple: no React context, just localStorage + derived state.
 */
export function useAuth() {
    const token = localStorage.getItem('token')
    const role = localStorage.getItem('role')
    const username = localStorage.getItem('username')
    const isLoggedIn = !!token

    const logout = () => {
        localStorage.removeItem('token')
        localStorage.removeItem('role')
        localStorage.removeItem('username')
        window.location.href = '/login'
    }

    return { token, role, username, isLoggedIn, logout }
}
