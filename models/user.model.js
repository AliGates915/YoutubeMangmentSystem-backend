import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      select: false,
    },
    role: {
      type: String,
      enum: ["admin", "subadmin", "script_writer", "editor", "uploader"],
      required: true,
    },
    assignedChannels: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Channel",
        },
      ],
      default: [],
    },
    accountStatus: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    lastLogin: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);

export default User;
