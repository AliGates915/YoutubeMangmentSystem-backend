import mongoose from "mongoose";

const channelSchema = new mongoose.Schema(
  {
    channelName: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    language: {
      type: String,
      enum: ["English", "Spanish", "German", "Portuguese", "French", "Italian", "Hindi"],
      required: true,
      trim: true,
    },
    categoryNiche: {
      type: String,
      required: true,
      trim: true,
    },
    contentType: {
      type: String,
      enum: ["long", "short"],
      required: true,
    },
    channelAvatarEmoji: {
      type: String,
      required: true,
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

const Channel = mongoose.model("Channel", channelSchema);

export default Channel;
