enum USER_CONNECTION_STATUS {
    OFFLINE = "offline",
    ONLINE = "online",
}

interface User {
    username: string
    roomId: string
    // Present once the server accepts the join. It is the central, stable
    // per-user color (account avatarColor or a deterministic guest color) used
    // for cursors/avatars; undefined until then and for the pre-join form user.
    avatarColor?: string
    // Present only for signed-in accounts; guests leave these undefined.
    userId?: string
    email?: string
}

interface RemoteUser extends User {
    status: USER_CONNECTION_STATUS
    cursorPosition: number
    typing: boolean
    currentFile: string
    socketId: string
}

enum USER_STATUS {
    INITIAL = "initial",
    CONNECTING = "connecting",
    ATTEMPTING_JOIN = "attempting-join",
    JOINED = "joined",
    CONNECTION_FAILED = "connection-failed",
    DISCONNECTED = "disconnected",
}

export { USER_CONNECTION_STATUS, USER_STATUS, RemoteUser, User }
