import mongoose from "mongoose";

const contentSchema = new mongoose.Schema(
  {
    channel: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Channel",
      required: true,
    },
    sourceUrl: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    sourceVideoId: {
      type: String,
      required: true,
      trim: true,
      index: {
        unique: true,
        sparse: true,
      },
    },
    videoTitle: {
      type: String,
      required: true,
      trim: true,
    },
    sourceCreator: {
      type: String,
      required: true,
      trim: true,
    },
    contentType: {
      type: String,
      enum: ["long", "short"],
      required: true,
    },
    priority: {
      type: String,
      enum: ["High", "Medium", "Low"],
      default: "Medium",
    },
    status: {
      type: String,
      enum: ["Pending", "In Progress", "Completed"],
      default: "Pending",
    },
    statusHistory: {
      type: [
        {
          status: {
            type: String,
            enum: ["Pending", "In Progress", "Completed"],
            required: true,
          },
          fromStatus: {
            type: String,
            enum: ["Pending", "In Progress", "Completed", null],
            default: null,
          },
          changedAt: {
            type: Date,
            default: Date.now,
          },
          changedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
          },
          stageRole: {
            type: String,
            enum: ["script_writer", "editor", "uploader"],
            default: "script_writer",
          },
        },
      ],
      default: [],
    },
    workflowStage: {
      type: String,
      enum: ["script_writer", "editor", "uploader", "done"],
      default: "script_writer",
    },
    assignedUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

const Content = mongoose.model("Content", contentSchema);

export default Content;
