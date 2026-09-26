import { useAuth } from "@/context/AuthContext"
import { GoogleLogin } from "@react-oauth/google"
import { FormEvent, useState } from "react"
import { toast } from "react-hot-toast"

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ""

type Mode = "login" | "signup"

// Optional sign-in panel shown alongside the guest join form. Signing in is
// never required — it just layers accounts on top of the guest flow.
const AuthPanel = () => {
    const { authUser, isAuthenticated, login, signup, loginWithGoogle, logout } =
        useAuth()
    const [mode, setMode] = useState<Mode>("login")
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [displayName, setDisplayName] = useState("")
    const [submitting, setSubmitting] = useState(false)

    // Signed-in view: a compact identity chip with a sign-out button.
    if (isAuthenticated && authUser) {
        return (
            <div className="flex w-full max-w-[500px] items-center justify-between gap-3 rounded-md border border-gray-600 bg-darkHover px-4 py-3 sm:w-[500px]">
                <div className="flex items-center gap-3">
                    <span
                        className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold text-black"
                        style={{ backgroundColor: authUser.avatarColor }}
                    >
                        {authUser.displayName.charAt(0).toUpperCase()}
                    </span>
                    <div className="flex flex-col">
                        <span className="font-semibold">
                            {authUser.displayName}
                        </span>
                        <span className="text-xs text-gray-400">
                            {authUser.email}
                        </span>
                    </div>
                </div>
                <button
                    onClick={logout}
                    className="rounded-md border border-gray-500 px-3 py-1.5 text-sm hover:bg-dark"
                >
                    Sign out
                </button>
            </div>
        )
    }

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        if (submitting) return
        setSubmitting(true)
        try {
            if (mode === "signup") {
                await signup(email, password, displayName)
                toast.success("Account created")
            } else {
                await login(email, password)
                toast.success("Signed in")
            }
        } catch (err) {
            toast.error((err as Error).message)
        } finally {
            setSubmitting(false)
        }
    }

    const handleGoogle = async (credential?: string) => {
        if (!credential) {
            toast.error("Google sign-in failed")
            return
        }
        try {
            await loginWithGoogle(credential)
            toast.success("Signed in with Google")
        } catch (err) {
            toast.error((err as Error).message)
        }
    }

    return (
        <div className="flex w-full max-w-[500px] flex-col gap-4 rounded-md border border-gray-600 bg-darkHover p-4 sm:w-[500px] sm:p-6">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                    {mode === "login" ? "Sign in" : "Create account"}
                </h2>
                <button
                    type="button"
                    className="text-sm text-primary underline"
                    onClick={() =>
                        setMode(mode === "login" ? "signup" : "login")
                    }
                >
                    {mode === "login"
                        ? "Need an account?"
                        : "Have an account?"}
                </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                {mode === "signup" && (
                    <input
                        type="text"
                        placeholder="Display name (optional)"
                        className="w-full rounded-md border border-gray-500 bg-dark px-3 py-2.5 focus:outline-none"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                    />
                )}
                <input
                    type="email"
                    placeholder="Email"
                    autoComplete="email"
                    className="w-full rounded-md border border-gray-500 bg-dark px-3 py-2.5 focus:outline-none"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                />
                <input
                    type="password"
                    placeholder="Password"
                    autoComplete={
                        mode === "login" ? "current-password" : "new-password"
                    }
                    className="w-full rounded-md border border-gray-500 bg-dark px-3 py-2.5 focus:outline-none"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                />
                <button
                    type="submit"
                    disabled={submitting}
                    className="mt-1 w-full rounded-md bg-primary px-8 py-2.5 font-semibold text-black disabled:opacity-60"
                >
                    {mode === "login" ? "Sign in" : "Create account"}
                </button>
            </form>

            {GOOGLE_CLIENT_ID && (
                <>
                    <div className="flex items-center gap-3 text-xs text-gray-400">
                        <span className="h-px flex-1 bg-gray-600" />
                        or
                        <span className="h-px flex-1 bg-gray-600" />
                    </div>
                    <div className="flex justify-center">
                        <GoogleLogin
                            onSuccess={(cred) =>
                                handleGoogle(cred.credential)
                            }
                            onError={() => toast.error("Google sign-in failed")}
                            theme="filled_black"
                            text="continue_with"
                            shape="rectangular"
                        />
                    </div>
                </>
            )}
        </div>
    )
}

export default AuthPanel
