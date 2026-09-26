enum USER_CONNECTION_STATUS {
	OFFLINE = "offline",
	ONLINE = "online",
}

interface User {
	username: string
	roomId: string
	status: USER_CONNECTION_STATUS
	cursorPosition: number
	typing: boolean
	currentFile: string | null
	socketId: string
	// Present only when the socket carried a valid JWT. Guests leave these
	// undefined and behave exactly as before. `avatarColor` is sourced from the
	// account when signed in so cursors/avatars stay stable across sessions.
	userId?: string
	email?: string
	avatarColor?: string
}

export { USER_CONNECTION_STATUS, User }
