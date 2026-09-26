import mongoose from "mongoose"
import { Room } from "../models/Room"
import { RoomFiles } from "../models/RoomFiles"
import { FileSystemItem } from "../types/file"
import {
	deleteNode,
	insertNode,
	renameNode,
	setChildren,
	setFileContent,
} from "../utils/fileTree"

// Whether Mongo is currently usable. When false, every persistence helper
// no-ops so the server keeps working as a pure relay (guest join, peer-push)
// exactly as it did before persistence existed.
let dbReady = false

export function isDbReady(): boolean {
	return dbReady
}

// Connect to MongoDB if MONGO_URI is configured. Never throws: a missing or
// unreachable database simply leaves the server in relay-only mode.
export async function connectDB(): Promise<void> {
	const uri = process.env.MONGO_URI
	if (!uri) {
		console.warn(
			"MONGO_URI not set — running without persistence (relay-only mode)."
		)
		return
	}

	mongoose.connection.on("connected", () => {
		dbReady = true
		console.log("MongoDB connected")
	})
	mongoose.connection.on("disconnected", () => {
		dbReady = false
		console.warn("MongoDB disconnected")
	})
	mongoose.connection.on("error", (err) => {
		console.error("MongoDB error:", err.message)
	})

	try {
		await mongoose.connect(uri)
	} catch (err) {
		dbReady = false
		console.error(
			"Failed to connect to MongoDB — running relay-only:",
			(err as Error).message
		)
	}
}

// Lazily create the Room document on first join and bump updatedAt otherwise.
export async function ensureRoom(roomId: string): Promise<void> {
	if (!dbReady) return
	try {
		await Room.updateOne(
			{ roomId },
			{
				$setOnInsert: { roomId, name: roomId, ownerId: null },
				$set: { updatedAt: new Date() },
			},
			{ upsert: true }
		)
	} catch (err) {
		console.error("ensureRoom failed:", (err as Error).message)
	}
}

// Load the persisted tree for a room, or null if the room has never been seeded.
export async function getRoomTree(
	roomId: string
): Promise<FileSystemItem | null> {
	if (!dbReady) return null
	try {
		const doc = await RoomFiles.findOne({ roomId }).lean()
		return (doc?.tree as FileSystemItem) ?? null
	} catch (err) {
		console.error("getRoomTree failed:", (err as Error).message)
		return null
	}
}

// Seed the room's tree only if it has none yet. Never overwrites an existing
// tree, so it is safe to call from every client that joins a fresh room.
export async function seedRoomTreeIfEmpty(
	roomId: string,
	tree: FileSystemItem
): Promise<void> {
	if (!dbReady || !tree) return
	try {
		await RoomFiles.updateOne(
			{ roomId },
			{ $setOnInsert: { roomId, tree } },
			{ upsert: true }
		)
	} catch (err) {
		console.error("seedRoomTreeIfEmpty failed:", (err as Error).message)
	}
}

// Serialize writes per room to avoid clobbering concurrent load-modify-save
// cycles on the same tree document.
const roomLocks = new Map<string, Promise<void>>()

async function withRoomLock(
	roomId: string,
	fn: () => Promise<void>
): Promise<void> {
	const prev = roomLocks.get(roomId) ?? Promise.resolve()
	const next = prev.then(fn, fn)
	// Keep the chain alive but don't let rejections leak into the next caller.
	roomLocks.set(
		roomId,
		next.catch(() => undefined)
	)
	return next
}

// Load the room's tree, apply a pure mutation, and persist the result.
async function mutateTree(
	roomId: string,
	mutate: (tree: FileSystemItem) => FileSystemItem
): Promise<void> {
	if (!dbReady) return
	await withRoomLock(roomId, async () => {
		try {
			const doc = await RoomFiles.findOne({ roomId })
			// Only apply granular edits to rooms that have been seeded; an
			// unseeded room is bootstrapped separately via seedRoomTreeIfEmpty.
			if (!doc) return
			doc.tree = mutate(doc.tree as FileSystemItem)
			doc.markModified("tree")
			await doc.save()
			await ensureRoom(roomId)
		} catch (err) {
			console.error("mutateTree failed:", (err as Error).message)
		}
	})
}

export function persistDirectoryCreated(
	roomId: string,
	parentDirId: string,
	newDirectory: FileSystemItem
): Promise<void> {
	return mutateTree(roomId, (tree) =>
		insertNode(tree, parentDirId, newDirectory)
	)
}

export function persistDirectoryUpdated(
	roomId: string,
	dirId: string,
	children: FileSystemItem[]
): Promise<void> {
	return mutateTree(roomId, (tree) => setChildren(tree, dirId, children))
}

export function persistNodeRenamed(
	roomId: string,
	id: string,
	newName: string
): Promise<void> {
	return mutateTree(roomId, (tree) => renameNode(tree, id, newName))
}

export function persistNodeDeleted(
	roomId: string,
	id: string
): Promise<void> {
	return mutateTree(roomId, (tree) => deleteNode(tree, id))
}

export function persistFileCreated(
	roomId: string,
	parentDirId: string,
	newFile: FileSystemItem
): Promise<void> {
	return mutateTree(roomId, (tree) => insertNode(tree, parentDirId, newFile))
}

// --- Debounced file-content persistence -----------------------------------
// FILE_UPDATED fires on (almost) every keystroke, so we coalesce writes per
// file and only flush the latest content after a short idle window. Cursor
// state is never persisted; only file content lands here.
const FLUSH_DELAY_MS = 1500

interface PendingWrite {
	roomId: string
	fileId: string
	content: string
	timer: NodeJS.Timeout
}

const pendingWrites = new Map<string, PendingWrite>()

function writeKey(roomId: string, fileId: string): string {
	return `${roomId}::${fileId}`
}

function flushWrite(key: string): void {
	const pending = pendingWrites.get(key)
	if (!pending) return
	pendingWrites.delete(key)
	clearTimeout(pending.timer)
	void mutateTree(pending.roomId, (tree) =>
		setFileContent(tree, pending.fileId, pending.content)
	)
}

export function persistFileUpdated(
	roomId: string,
	fileId: string,
	newContent: string
): void {
	if (!dbReady) return
	const key = writeKey(roomId, fileId)
	const existing = pendingWrites.get(key)
	if (existing) clearTimeout(existing.timer)
	const timer = setTimeout(() => flushWrite(key), FLUSH_DELAY_MS)
	pendingWrites.set(key, { roomId, fileId, content: newContent, timer })
}

// Immediately flush any pending debounced content writes for a room (e.g. when
// the last participant is leaving) so nothing is lost.
export function flushRoomWrites(roomId: string): void {
	for (const key of pendingWrites.keys()) {
		if (key.startsWith(`${roomId}::`)) flushWrite(key)
	}
}
