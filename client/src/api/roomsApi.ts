import axios, { AxiosInstance } from "axios"

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3000"

// Talks to the server's /rooms routes (account-scoped "My rooms"). These
// endpoints require a JWT, passed per-request in the Authorization header.
const roomsApi: AxiosInstance = axios.create({
    baseURL: `${BACKEND_URL}/rooms`,
    headers: {
        "Content-Type": "application/json",
    },
})

export default roomsApi
