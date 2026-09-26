import axios, { AxiosInstance } from "axios"

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3000"

// Talks to the server's /auth routes. Separate from the Socket.io connection;
// auth is plain HTTP that returns our own JWT, which the socket then carries.
const authApi: AxiosInstance = axios.create({
    baseURL: `${BACKEND_URL}/auth`,
    headers: {
        "Content-Type": "application/json",
    },
})

export default authApi
