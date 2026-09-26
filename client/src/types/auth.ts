// A signed-in account as the client knows it. Guests have no AuthUser at all.
interface AuthUser {
    userId: string
    email: string
    displayName: string
    avatarColor: string
}

interface AuthContext {
    // The current account, or null when browsing as a guest.
    authUser: AuthUser | null
    token: string | null
    isAuthenticated: boolean
    // True while the initial "restore session from localStorage" check runs.
    isLoading: boolean
    signup: (
        email: string,
        password: string,
        displayName?: string,
    ) => Promise<void>
    login: (email: string, password: string) => Promise<void>
    loginWithGoogle: (credential: string) => Promise<void>
    logout: () => void
}

export type { AuthUser, AuthContext }
