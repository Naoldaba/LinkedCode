import roomsApi from "@/api/roomsApi"
import { useAppContext } from "@/context/AppContext"
import { useAuth } from "@/context/AuthContext"
import { UserRoom } from "@/types/room"
import { useCallback, useEffect, useState } from "react"
import { toast } from "react-hot-toast"

// Format an ISO timestamp as a short, human "last opened" label.
function formatLastOpened(iso: string): string {
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return ""
    return date.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    })
}

// Signed-in dashboard of the account's saved rooms/history (Phase 4). Guests
// never see this — HomePage only renders it when authenticated — so the guest
// join flow is completely untouched. Selecting a room prefills the join form's
// room id; the user still joins through the existing flow (with any username).
const MyRooms = () => {
    const { token, isAuthenticated } = useAuth()
    const { currentUser, setCurrentUser } = useAppContext()
    const [rooms, setRooms] = useState<UserRoom[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const loadRooms = useCallback(async () => {
        if (!token) return
        setIsLoading(true)
        setError(null)
        try {
            const { data } = await roomsApi.get("/mine", {
                headers: { Authorization: `Bearer ${token}` },
            })
            setRooms(data.rooms ?? [])
        } catch {
            setError("Could not load your rooms.")
        } finally {
            setIsLoading(false)
        }
    }, [token])

    useEffect(() => {
        if (isAuthenticated) loadRooms()
    }, [isAuthenticated, loadRooms])

    const selectRoom = (roomId: string) => {
        setCurrentUser({ ...currentUser, roomId })
        toast.success("Room selected — enter a username and Join")
    }

    if (!isAuthenticated) return null

    return (
        <div className="flex w-full max-w-[500px] flex-col gap-3 rounded-md border border-gray-600 bg-darkHover p-4 sm:w-[500px] sm:p-6">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">My rooms</h2>
                <button
                    type="button"
                    onClick={loadRooms}
                    className="text-sm text-primary underline"
                >
                    Refresh
                </button>
            </div>

            {isLoading ? (
                <p className="text-sm text-gray-400">Loading your rooms…</p>
            ) : error ? (
                <p className="text-sm text-red-400">{error}</p>
            ) : rooms.length === 0 ? (
                <p className="text-sm text-gray-400">
                    No saved rooms yet. Join or create a room below and it will
                    show up here.
                </p>
            ) : (
                <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto">
                    {rooms.map((room) => (
                        <li key={room.roomId}>
                            <button
                                type="button"
                                onClick={() => selectRoom(room.roomId)}
                                className="flex w-full flex-col items-start gap-0.5 rounded-md border border-gray-600 bg-dark px-3 py-2 text-left hover:border-primary"
                            >
                                <span className="flex w-full items-center justify-between gap-2">
                                    <span className="truncate font-medium">
                                        {room.name}
                                    </span>
                                    {room.isOwner && (
                                        <span className="shrink-0 rounded bg-primary px-1.5 py-0.5 text-xs font-semibold text-black">
                                            Owner
                                        </span>
                                    )}
                                </span>
                                <span className="text-xs text-gray-400">
                                    {formatLastOpened(room.lastOpenedAt)}
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}

export default MyRooms
