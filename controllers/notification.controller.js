import mongoose from "mongoose";
import Content from "../models/content.model.js";
import Notification from "../models/notification.model.js";

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const canReceiveWorkflowNotifications = (role) => ["editor", "uploader"].includes(role);

const syncPendingWorkNotifications = async (user) => {
  if (!canReceiveWorkflowNotifications(user.role)) {
    return 0;
  }

  const assignedChannels = Array.isArray(user.assignedChannels)
    ? user.assignedChannels
    : [];

  if (!assignedChannels.length) {
    return 0;
  }

  const contents = await Content.find({
    channel: { $in: assignedChannels },
    workflowStage: user.role,
    assignedUser: null,
    status: "Pending",
  }).select("_id createdBy statusHistory");

  if (!contents.length) {
    return 0;
  }

  const existingNotifications = await Notification.find({
    content: { $in: contents.map((content) => content._id) },
    recipient: user._id,
    targetRole: user.role,
    status: "pending",
  }).select("content");

  const existingContentIds = new Set(
    existingNotifications.map((notification) => String(notification.content))
  );

  const notifications = contents
    .filter((content) => !existingContentIds.has(String(content._id)))
    .map((content) => {
      const completedEntry = [...content.statusHistory]
        .reverse()
        .find((entry) => entry.status === "Completed" && entry.changedBy);

      return {
        content: content._id,
        recipient: user._id,
        fromUser: completedEntry?.changedBy || content.createdBy,
        targetRole: user.role,
        message: `New ${user.role.replace("_", " ")} work is available`,
      };
    });

  if (!notifications.length) {
    return 0;
  }

  await Notification.insertMany(notifications);
  return notifications.length;
};

const formatNotification = (notification) => ({
  id: notification._id,
  content: notification.content
    ? {
        id: notification.content._id,
        title: notification.content.videoTitle,
        status: notification.content.status,
        workflowStage: notification.content.workflowStage,
        channel: notification.content.channel
          ? {
              id: notification.content.channel._id,
              name: notification.content.channel.channelName,
              avatarEmoji: notification.content.channel.channelAvatarEmoji,
            }
          : null,
      }
    : null,
  fromUser: notification.fromUser
    ? {
        id: notification.fromUser._id,
        fullName: notification.fromUser.fullName,
        email: notification.fromUser.email,
        role: notification.fromUser.role,
      }
    : null,
  targetRole: notification.targetRole,
  status: notification.status,
  message: notification.message,
  acceptedAt: notification.acceptedAt,
  createdAt: notification.createdAt,
});

export const getMyNotifications = async (req, res) => {
  try {
    const { status = "pending" } = req.query;

    await syncPendingWorkNotifications(req.user);

    const filter = {
      recipient: req.user._id,
    };

    if (status !== "all") {
      filter.status = status;
    }

    const notifications = await Notification.find(filter)
      .populate({
        path: "content",
        select: "videoTitle status workflowStage channel",
        populate: {
          path: "channel",
          select: "channelName channelAvatarEmoji",
        },
      })
      .populate("fromUser", "fullName email role")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: notifications.length,
      notifications: notifications.map(formatNotification),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const acceptNotification = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid notification id",
      });
    }

    const notification = await Notification.findOne({
      _id: id,
      recipient: req.user._id,
      status: "pending",
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Pending notification not found",
      });
    }

    if (req.user.role !== notification.targetRole) {
      return res.status(403).json({
        success: false,
        message: "This notification is not for your role",
      });
    }

    const now = new Date();
    const content = await Content.findOneAndUpdate(
      {
        _id: notification.content,
        workflowStage: notification.targetRole,
        assignedUser: null,
      },
      {
        $set: {
          assignedUser: req.user._id,
          status: "Pending",
        },
        $push: {
          statusHistory: {
            status: "Pending",
            fromStatus: null,
            changedAt: now,
            changedBy: req.user._id,
            stageRole: notification.targetRole,
          },
        },
      },
      { new: true }
    )
      .populate("channel", "channelName categoryNiche channelAvatarEmoji contentType")
      .populate("assignedUser", "fullName email role");

    if (!content) {
      await Notification.updateOne(
        { _id: notification._id },
        { status: "expired" }
      );

      return res.status(409).json({
        success: false,
        message: "This work has already been accepted by another user",
      });
    }

    await Notification.updateMany(
      {
        content: notification.content,
        targetRole: notification.targetRole,
        status: "pending",
      },
      { status: "expired" }
    );

    notification.status = "accepted";
    notification.acceptedAt = now;
    await notification.save();

    return res.status(200).json({
      success: true,
      message: "Work accepted successfully",
      content,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
