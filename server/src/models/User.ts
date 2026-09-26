import { Schema, model } from "mongoose"

// An account. Both `passwordHash` and `googleId` are optional so a single user
// may authenticate with email/password, Google, or (after linking) either one.
// Guests never reach this collection — they join with just a username + roomId.
interface UserDoc {
	email: string
	passwordHash?: string
	googleId?: string
	displayName: string
	avatarColor: string
	createdAt: Date
}

const userSchema = new Schema<UserDoc>({
	email: {
		type: String,
		required: true,
		unique: true,
		index: true,
		lowercase: true,
		trim: true,
	},
	passwordHash: { type: String, default: undefined },
	googleId: { type: String, default: undefined },
	displayName: { type: String, required: true },
	avatarColor: { type: String, required: true },
	createdAt: { type: Date, default: Date.now },
})

export const User = model<UserDoc>("User", userSchema)
export type { UserDoc }
