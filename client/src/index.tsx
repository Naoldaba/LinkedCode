// import React from "react"
import ReactDOM from "react-dom/client"
import { GoogleOAuthProvider } from "@react-oauth/google"
import App from "./App.tsx"
import AppProvider from "./context/AppProvider.tsx"
import "./index.css"

// Supplied via env; when blank, Google sign-in is simply not offered (the
// provider still renders so the rest of the app is unaffected).
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ""

ReactDOM.createRoot(document.getElementById("root")!).render(
    // <React.StrictMode>
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
        <AppProvider>
            <App />
        </AppProvider>
    </GoogleOAuthProvider>,
    // </React.StrictMode>
)
