import axios, { AxiosInstance } from "axios"

// Code execution goes through our own backend, which proxies to a self-hosted
// Piston engine. (The public emkc.org Piston API became whitelist-only in 2026.)
// Reuses VITE_BACKEND_URL so it follows the same local/production split as the
// rest of the app.
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3000"
const pistonBaseUrl = `${BACKEND_URL}/piston`

const instance: AxiosInstance = axios.create({
    baseURL: pistonBaseUrl,
    headers: {
        "Content-Type": "application/json",
    },
})

export default instance
