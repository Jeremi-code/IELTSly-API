import mongoose, { Schema } from "mongoose";
import { IUser } from "../types/user.types.js";

const UserSchema: Schema = new Schema(
  {
    _id: { type: String, required: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    name: { type: String, required: true },
    emailVerified: { type: Boolean, required: true, default: false },
    image: { type: String },
    firstName: { type: String },
    lastName: { type: String },
  },
  {
    collection: "user",
    timestamps: true,
  }
);

export default mongoose.model<IUser>("User", UserSchema);

