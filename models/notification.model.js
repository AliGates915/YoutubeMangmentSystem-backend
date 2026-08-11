import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    content: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Content",
      required: true,
    },
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    fromUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    targetRole: {
      type: String,
      enum: ["editor", "uploader"],
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "expired"],
      default: "pending",
    },
    message: {
      type: String,
      required: true,
    },
    acceptedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

notificationSchema.index({ recipient: 1, status: 1, createdAt: -1 });
notificationSchema.index({ content: 1, targetRole: 1, status: 1 });

const Notification = mongoose.model("Notification", notificationSchema);

export default Notification;
