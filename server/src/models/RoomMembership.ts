import { Schema, model } from "mongoose"

// Links a signed-in account to a room it has opened. This is what powers the
// account's "My rooms" list and history — `lastOpenedAt` orders the list.
// Guests never get a membership row; their flow is unchanged.
interface RoomMembershipDoc {
	userId: Schema.Types.ObjectId
	roomId: string
	lastOpenedAt: Date
}

const roomMembershipSchema = new Schema<RoomMembershipDoc>({
	userId: {
		type: Schema.Types.ObjectId,
		ref: "User",
		required: true,
		index: true,
	},
	roomId: { type: String, required: true, index: true },
	lastOpenedAt: { type: Date, default: Date.now },
})

// Exactly one membership row per (user, room) pair; re-opening a room just
// bumps lastOpenedAt rather than adding duplicates.
roomMembershipSchema.index({ userId: 1, roomId: 1 }, { unique: true })

export const RoomMembership = model<RoomMembershipDoc>(
	"RoomMembership",
	roomMembershipSchema
)
export type { RoomMembershipDoc }
