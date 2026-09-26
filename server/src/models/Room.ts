import { Schema, model } from "mongoose"

// A collaboration room/project and its metadata. `ownerId` is null for
// guest-created rooms; account ownership is layered on in a later phase.
const roomSchema = new Schema(
	{
		roomId: { type: String, required: true, unique: true, index: true },
		name: { type: String, required: true },
		ownerId: {
			type: Schema.Types.ObjectId,
			ref: "User",
			default: null,
		},
	},
	{ timestamps: true }
)

export const Room = model("Room", roomSchema)
