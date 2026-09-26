import express, { Response, Request } from "express"
import dotenv from "dotenv"
import http from "http"
import cors from "cors"
import { SocketEvent, SocketId } from "./types/socket"
import { USER_CONNECTION_STATUS, User } from "./types/user"
import { Server } from "socket.io"
import path from "path"
import {
	connectDB,
	ensureRoom,
	flushRoomWrites,
	getRoomTree,
	persistDirectoryCreated,
	persistDirectoryUpdated,
	persistFileCreated,
	persistFileUpdated,
	persistNodeDeleted,
	persistNodeRenamed,
	recordRoomMembership,
	seedRoomTreeIfEmpty,
} from "./db/persistence"
import authRouter from "./auth/routes"
import roomsRouter from "./rooms/routes"
import { colorForKey, verifyToken } from "./auth/auth"
import { CursorUpdatePayload } from "./types/cursor"
import { pistonRouter } from "./piston/piston"

dotenv.config()

// Connect to MongoDB (no-op / relay-only if MONGO_URI is unset or unreachable).
connectDB()

const app = express()

app.use(express.json())

app.use(cors())

app.use(express.static(path.join(__dirname, "public"))) // Serve static files

// Authentication routes (email/password + Google). Guests never hit these.
app.use("/auth", authRouter)

// Account-scoped room routes ("My rooms"). Requires a valid JWT; guests get 401.
app.use("/rooms", roomsRouter)

// Code execution proxy. The client calls our backend, which adapts requests to
// the Wandbox execution service (keyless). Named /piston for client compatibility.
app.use("/piston", pistonRouter)

const server = http.createServer(app)
const io = new Server(server, {
	cors: {
		origin: "*",
	},
	maxHttpBufferSize: 1e8,
	pingTimeout: 60000,
})

let userSocketMap: User[] = []

// Function to get all users in a room
function getUsersInRoom(roomId: string): User[] {
	return userSocketMap.filter((user) => user.roomId == roomId)
}

// Function to get room id by socket id
function getRoomId(socketId: SocketId): string | null {
	const roomId = userSocketMap.find(
		(user) => user.socketId === socketId
	)?.roomId

	if (!roomId) {
		console.error("Room ID is undefined for socket ID:", socketId)
		return null
	}
	return roomId
}

function getUserBySocketId(socketId: SocketId): User | null {
	const user = userSocketMap.find((user) => user.socketId === socketId)
	if (!user) {
		console.error("User not found for socket ID:", socketId)
		return null
	}
	return user
}

io.on("connection", (socket) => {
	// Every socket carries an OPTIONAL JWT in its handshake. A valid token makes
	// the socket an authenticated account; anything else (missing/expired) is a
	// guest, and presence/collaboration work identically either way.
	const auth = verifyToken(socket.handshake.auth?.token)

	// Handle user actions
	socket.on(SocketEvent.JOIN_REQUEST, async ({ roomId, username }) => {
		// Check is username exist in the room
		const isUsernameExist = getUsersInRoom(roomId).filter(
			(u) => u.username === username
		)
		if (isUsernameExist.length > 0) {
			io.to(socket.id).emit(SocketEvent.USERNAME_EXISTS)
			return
		}

		const user = {
			username,
			roomId,
			status: USER_CONNECTION_STATUS.ONLINE,
			cursorPosition: 0,
			typing: false,
			socketId: socket.id,
			currentFile: null,
			// Central, stable per-user color: the account's avatarColor when
			// signed in, otherwise a deterministic color derived from the guest's
			// username. This is the single source for cursor/avatar color (Phase 5)
			// so it never uses react-avatar's auto-color.
			avatarColor: auth?.avatarColor ?? colorForKey(username),
			// Attach account identity when the socket is authenticated; guests
			// leave these undefined.
			...(auth
				? {
						userId: auth.userId,
						email: auth.email,
					}
				: {}),
		}
		userSocketMap.push(user)
		socket.join(roomId)
		socket.broadcast.to(roomId).emit(SocketEvent.USER_JOINED, { user })
		const users = getUsersInRoom(roomId)
		io.to(socket.id).emit(SocketEvent.JOIN_ACCEPTED, { user, users })

		// Persistence: lazily create the room (the first signed-in participant
		// becomes its owner), record this account's membership for "My rooms",
		// then restore its saved files.
		await ensureRoom(roomId, auth?.userId)
		if (auth) {
			void recordRoomMembership(auth.userId, roomId)
		}
		const tree = await getRoomTree(roomId)
		if (tree) {
			// Room has saved files — restore them straight from the database
			// (the authoritative path, replacing the fragile peer-push).
			io.to(socket.id).emit(SocketEvent.SYNC_FILE_STRUCTURE, {
				fileStructure: tree,
				openFiles: [],
				activeFile: null,
			})
		} else if (users.length === 1) {
			// Brand-new room whose first participant is this user: ask them to
			// send their current structure so we can seed the database with it.
			io.to(socket.id).emit(SocketEvent.REQUEST_FILE_STRUCTURE)
		}
	})

	socket.on("disconnecting", () => {
		const user = getUserBySocketId(socket.id)
		if (!user) return
		const roomId = user.roomId
		socket.broadcast
			.to(roomId)
			.emit(SocketEvent.USER_DISCONNECTED, { user })
		// Remove this collaborator's remote cursor from everyone else's editor.
		socket.broadcast
			.to(roomId)
			.emit(SocketEvent.CURSOR_REMOVE, { socketId: socket.id })
		userSocketMap = userSocketMap.filter((u) => u.socketId !== socket.id)
		socket.leave(roomId)
		// Flush any debounced content writes so nothing is lost when the last
		// participant leaves the room.
		flushRoomWrites(roomId)
	})

	// Handle file actions
	socket.on(
		SocketEvent.SYNC_FILE_STRUCTURE,
		({ fileStructure, openFiles, activeFile, socketId }) => {
			// A live peer is pushing the current structure to a new joiner —
			// seed the database from it too, in case the room was never saved
			// (e.g. peers joined before the first user seeded it).
			const roomId = getRoomId(socket.id)
			if (roomId && fileStructure) {
				seedRoomTreeIfEmpty(roomId, fileStructure)
			}
			io.to(socketId).emit(SocketEvent.SYNC_FILE_STRUCTURE, {
				fileStructure,
				openFiles,
				activeFile,
			})
		}
	)

	// A joiner responding to REQUEST_FILE_STRUCTURE: seed the room's saved
	// files from their current structure (no-op if already seeded).
	socket.on(SocketEvent.PERSIST_FILE_STRUCTURE, ({ fileStructure }) => {
		const roomId = getRoomId(socket.id)
		if (!roomId || !fileStructure) return
		seedRoomTreeIfEmpty(roomId, fileStructure)
	})

	socket.on(
		SocketEvent.DIRECTORY_CREATED,
		({ parentDirId, newDirectory }) => {
			const roomId = getRoomId(socket.id)
			if (!roomId) return
			socket.broadcast.to(roomId).emit(SocketEvent.DIRECTORY_CREATED, {
				parentDirId,
				newDirectory,
			})
			persistDirectoryCreated(roomId, parentDirId, newDirectory)
		}
	)

	socket.on(SocketEvent.DIRECTORY_UPDATED, ({ dirId, children }) => {
		const roomId = getRoomId(socket.id)
		if (!roomId) return
		socket.broadcast.to(roomId).emit(SocketEvent.DIRECTORY_UPDATED, {
			dirId,
			children,
		})
		persistDirectoryUpdated(roomId, dirId, children)
	})

	socket.on(SocketEvent.DIRECTORY_RENAMED, (payload) => {
		const { dirId, newName, newDirName } = payload
		const roomId = getRoomId(socket.id)
		if (!roomId) return
		socket.broadcast.to(roomId).emit(SocketEvent.DIRECTORY_RENAMED, payload)
		// The client sends the new name as `newDirName`; accept either field.
		persistNodeRenamed(roomId, dirId, newName ?? newDirName)
	})

	socket.on(SocketEvent.DIRECTORY_DELETED, ({ dirId }) => {
		const roomId = getRoomId(socket.id)
		if (!roomId) return
		socket.broadcast
			.to(roomId)
			.emit(SocketEvent.DIRECTORY_DELETED, { dirId })
		persistNodeDeleted(roomId, dirId)
	})

	socket.on(SocketEvent.FILE_CREATED, ({ parentDirId, newFile }) => {
		const roomId = getRoomId(socket.id)
		if (!roomId) return
		socket.broadcast
			.to(roomId)
			.emit(SocketEvent.FILE_CREATED, { parentDirId, newFile })
		persistFileCreated(roomId, parentDirId, newFile)
	})

	socket.on(SocketEvent.FILE_UPDATED, ({ fileId, newContent }) => {
		const roomId = getRoomId(socket.id)
		if (!roomId) return
		socket.broadcast.to(roomId).emit(SocketEvent.FILE_UPDATED, {
			fileId,
			newContent,
		})
		// Debounced: never writes to the DB on every keystroke.
		persistFileUpdated(roomId, fileId, newContent)
	})

	socket.on(SocketEvent.FILE_RENAMED, ({ fileId, newName }) => {
		const roomId = getRoomId(socket.id)
		if (!roomId) return
		socket.broadcast.to(roomId).emit(SocketEvent.FILE_RENAMED, {
			fileId,
			newName,
		})
		persistNodeRenamed(roomId, fileId, newName)
	})

	socket.on(SocketEvent.FILE_DELETED, ({ fileId }) => {
		const roomId = getRoomId(socket.id)
		if (!roomId) return
		socket.broadcast.to(roomId).emit(SocketEvent.FILE_DELETED, { fileId })
		persistNodeDeleted(roomId, fileId)
	})

	// Handle user status
	socket.on(SocketEvent.USER_OFFLINE, ({ socketId }) => {
		userSocketMap = userSocketMap.map((user) => {
			if (user.socketId === socketId) {
				return { ...user, status: USER_CONNECTION_STATUS.OFFLINE }
			}
			return user
		})
		const roomId = getRoomId(socketId)
		if (!roomId) return
		socket.broadcast.to(roomId).emit(SocketEvent.USER_OFFLINE, { socketId })
	})

	socket.on(SocketEvent.USER_ONLINE, ({ socketId }) => {
		userSocketMap = userSocketMap.map((user) => {
			if (user.socketId === socketId) {
				return { ...user, status: USER_CONNECTION_STATUS.ONLINE }
			}
			return user
		})
		const roomId = getRoomId(socketId)
		if (!roomId) return
		socket.broadcast.to(roomId).emit(SocketEvent.USER_ONLINE, { socketId })
	})

	// Handle chat actions
	socket.on(SocketEvent.SEND_MESSAGE, ({ message }) => {
		const roomId = getRoomId(socket.id)
		if (!roomId) return
		socket.broadcast
			.to(roomId)
			.emit(SocketEvent.RECEIVE_MESSAGE, { message })
	})

	// Handle cursor position
	socket.on(SocketEvent.TYPING_START, ({ cursorPosition }) => {
		userSocketMap = userSocketMap.map((user) => {
			if (user.socketId === socket.id) {
				return { ...user, typing: true, cursorPosition }
			}
			return user
		})
		const user = getUserBySocketId(socket.id)
		if (!user) return
		const roomId = user.roomId
		socket.broadcast.to(roomId).emit(SocketEvent.TYPING_START, { user })
	})

	socket.on(SocketEvent.TYPING_PAUSE, () => {
		userSocketMap = userSocketMap.map((user) => {
			if (user.socketId === socket.id) {
				return { ...user, typing: false }
			}
			return user
		})
		const user = getUserBySocketId(socket.id)
		if (!user) return
		const roomId = user.roomId
		socket.broadcast.to(roomId).emit(SocketEvent.TYPING_PAUSE, { user })
	})

	// Ephemeral multi-cursor sync (Phase 6). Relay a collaborator's caret /
	// selection to the rest of THEIR room only. Membership is validated via the
	// socket's known user; identity and color are stamped server-side (never
	// trusted from the client), and no file contents are carried.
	socket.on(
		SocketEvent.CURSOR_UPDATE,
		({ fileId, position, selection }: CursorUpdatePayload) => {
			const user = getUserBySocketId(socket.id)
			if (!user) return
			if (!fileId || !position) return
			socket.broadcast.to(user.roomId).emit(SocketEvent.CURSOR_UPDATE, {
				socketId: socket.id,
				userId: user.userId,
				username: user.username,
				color: user.avatarColor ?? colorForKey(user.username),
				fileId,
				position,
				selection,
			})
		}
	)

	// A collaborator's cursor should disappear (e.g. they left the file).
	socket.on(SocketEvent.CURSOR_REMOVE, () => {
		const user = getUserBySocketId(socket.id)
		if (!user) return
		socket.broadcast
			.to(user.roomId)
			.emit(SocketEvent.CURSOR_REMOVE, { socketId: socket.id })
	})

	socket.on(SocketEvent.REQUEST_DRAWING, () => {
		const roomId = getRoomId(socket.id)
		if (!roomId) return
		socket.broadcast
			.to(roomId)
			.emit(SocketEvent.REQUEST_DRAWING, { socketId: socket.id })
	})

	socket.on(SocketEvent.SYNC_DRAWING, ({ drawingData, socketId }) => {
		socket.broadcast
			.to(socketId)
			.emit(SocketEvent.SYNC_DRAWING, { drawingData })
	})

	socket.on(SocketEvent.DRAWING_UPDATE, ({ snapshot }) => {
		const roomId = getRoomId(socket.id)
		if (!roomId) return
		socket.broadcast.to(roomId).emit(SocketEvent.DRAWING_UPDATE, {
			snapshot,
		})
	})
})

const PORT = process.env.PORT || 3000

app.get("/", (req: Request, res: Response) => {
	// Send the index.html file
	res.sendFile(path.join(__dirname, "..", "public", "index.html"))
})

server.listen(PORT, () => {
	console.log(`Listening on port ${PORT}`)
})
