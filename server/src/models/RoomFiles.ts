import { Schema, model } from "mongoose"
import { FileSystemItem } from "../types/file"

// The embedded FileSystemItem tree for a room. Stored as a flexible Mixed
// document so it matches, byte for byte, the tree the client already
// sends/receives over Socket.io.
interface RoomFilesDoc {
	roomId: string
	tree: FileSystemItem
}

const roomFilesSchema = new Schema<RoomFilesDoc>({
	roomId: { type: String, required: true, unique: true, index: true },
	tree: { type: Schema.Types.Mixed, required: true },
})

export const RoomFiles = model<RoomFilesDoc>("RoomFiles", roomFilesSchema)
