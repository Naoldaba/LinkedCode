import authApi from "@/api/authApi"
import { AuthContext as AuthContextType, AuthUser } from "@/types/auth"
import axios from "axios"
import {
    ReactNode,
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from "react"

const AuthContext = createContext<AuthContextType | null>(null)

export const useAuth = (): AuthContextType => {
    const context = useContext(AuthContext)
    if (context === null) {
        throw new Error("useAuth must be used within an AuthContextProvider")
    }
    return context
}

const TOKEN_KEY = "linkedcode.token"
const USER_KEY = "linkedcode.user"

// Turn an axios error into a human-readable message the UI can toast.
function messageFromError(err: unknown, fallback: string): string {
    if (axios.isAxiosError(err)) {
        return err.response?.data?.error || err.message || fallback
    }
    return fallback
}

function AuthContextProvider({ children }: { children: ReactNode }) {
    const [token, setToken] = useState<string | null>(null)
    const [authUser, setAuthUser] = useState<AuthUser | null>(null)
    const [isLoading, setIsLoading] = useState<boolean>(true)

    // Restore any saved session from localStorage on first load.
    useEffect(() => {
        try {
            const savedToken = localStorage.getItem(TOKEN_KEY)
            const savedUser = localStorage.getItem(USER_KEY)
            if (savedToken && savedUser) {
                setToken(savedToken)
                setAuthUser(JSON.parse(savedUser) as AuthUser)
            }
        } catch {
            // Corrupt/blocked storage — fall back to guest.
        } finally {
            setIsLoading(false)
        }
    }, [])

    const persistSession = useCallback((tok: string, user: AuthUser) => {
        setToken(tok)
        setAuthUser(user)
        try {
            localStorage.setItem(TOKEN_KEY, tok)
            localStorage.setItem(USER_KEY, JSON.stringify(user))
        } catch {
            // Ignore storage failures; the in-memory session still works.
        }
    }, [])

    const signup = useCallback(
        async (email: string, password: string, displayName?: string) => {
            try {
                const { data } = await authApi.post("/signup", {
                    email,
                    password,
                    displayName,
                })
                persistSession(data.token, data.user)
            } catch (err) {
                throw new Error(
                    messageFromError(err, "Could not create the account."),
                )
            }
        },
        [persistSession],
    )

    const login = useCallback(
        async (email: string, password: string) => {
            try {
                const { data } = await authApi.post("/login", { email, password })
                persistSession(data.token, data.user)
            } catch (err) {
                throw new Error(messageFromError(err, "Could not sign in."))
            }
        },
        [persistSession],
    )

    const loginWithGoogle = useCallback(
        async (credential: string) => {
            try {
                const { data } = await authApi.post("/google", { credential })
                persistSession(data.token, data.user)
            } catch (err) {
                throw new Error(
                    messageFromError(err, "Could not sign in with Google."),
                )
            }
        },
        [persistSession],
    )

    const logout = useCallback(() => {
        setToken(null)
        setAuthUser(null)
        try {
            localStorage.removeItem(TOKEN_KEY)
            localStorage.removeItem(USER_KEY)
        } catch {
            // Ignore storage failures.
        }
    }, [])

    const value = useMemo<AuthContextType>(
        () => ({
            authUser,
            token,
            isAuthenticated: Boolean(token && authUser),
            isLoading,
            signup,
            login,
            loginWithGoogle,
            logout,
        }),
        [authUser, token, isLoading, signup, login, loginWithGoogle, logout],
    )

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export { AuthContextProvider }
export default AuthContext
