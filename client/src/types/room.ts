// One saved room in a signed-in account's "My rooms" list, as returned by
// GET /rooms/mine. `lastOpenedAt` is an ISO string over the wire.
interface UserRoom {
    roomId: string
    name: string
    lastOpenedAt: string
    isOwner: boolean
}

export type { UserRoom }
