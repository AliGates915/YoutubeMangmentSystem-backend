import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import Channel from "../models/channel.model.js";
import Content from "../models/content.model.js";
import Notification from "../models/notification.model.js";
import User from "../models/user.model.js";

const allowedRoles = ["admin", "subadmin", "script_writer", "editor", "uploader"];

const normalizeRole = (role) =>
  String(role || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

const hasAllChannelAccess = (role) => ["admin", "subadmin"].includes(role);

const normalizeAssignedChannelsForResponse = (user) => {
  if (hasAllChannelAccess(user.role)) return null;
  return Array.isArray(user.assignedChannels) ? user.assignedChannels : [];
};

const getAssignedChannelsFromBody = (body) => {
  if (Array.isArray(body.assignedChannels)) return body.assignedChannels;
  if (Array.isArray(body.assignedChannelIds)) return body.assignedChannelIds;
  if (Array.isArray(body.channelIds)) return body.channelIds;
  if (Array.isArray(body.channels)) return body.channels;
  return null;
};

const formatUser = (user) => ({
  id: user._id,
  fullName: user.fullName,
  email: user.email,
  role: user.role,
  accountStatus: user.accountStatus,
  assignedChannels: normalizeAssignedChannelsForResponse(user),
  lastLogin: user.lastLogin,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const formatUserForTable = (user) => ({
  id: user._id,
  user: {
    fullName: user.fullName,
    email: user.email,
    avatarText: user.fullName?.charAt(0)?.toUpperCase() || "U",
  },
  role: user.role,
  accountStatus: user.accountStatus,
  assignedChannels: normalizeAssignedChannelsForResponse(user),
  lastLogin: user.lastLogin,
});

const canReceiveWorkflowNotifications = (role) => ["editor", "uploader"].includes(role);

const createPendingWorkNotificationsForUser = async (user, channelIds) => {
  if (!canReceiveWorkflowNotifications(user.role) || !channelIds.length) {
    return 0;
  }

  const contents = await Content.find({
    channel: { $in: channelIds },
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

export const getUsers = async (req, res) => {
  try {
    const users = await User.find()
      .select("fullName email role accountStatus assignedChannels lastLogin createdAt")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: users.length,
      users: users.map(formatUserForTable),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const createUser = async (req, res) => {
  try {
    const { fullName, email, password, role } = req.body;
    const normalizedRole = normalizeRole(role);

    if (!fullName || !email || !password || !role) {
      return res.status(400).json({
        success: false,
        message: "fullName, email, password and role are required",
      });
    }

    if (!allowedRoles.includes(normalizedRole)) {
      return res.status(400).json({
        success: false,
        message: "Role must be admin, subadmin, script_writer, editor or uploader",
      });
    }

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "User with this email already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      fullName,
      email,
      password: hashedPassword,
      role: normalizedRole,
      assignedChannels: hasAllChannelAccess(normalizedRole) ? null : [],
      accountStatus: "active",
    });

    return res.status(201).json({
      success: true,
      message: "User created successfully",
      user: formatUser(user),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user id",
      });
    }

    const deletedUser = await User.findByIdAndDelete(id);

    if (!deletedUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const updateUserChannelAccess = async (req, res) => {
  try {
    const { id } = req.params;
    const assignedChannels = getAssignedChannelsFromBody(req.body);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user id",
      });
    }

    if (!assignedChannels) {
      return res.status(400).json({
        success: false,
        message: "assignedChannels must be an array",
      });
    }

    const uniqueChannelIds = [...new Set(assignedChannels.map(String))];
    const hasInvalidChannelId = uniqueChannelIds.some(
      (channelId) => !mongoose.Types.ObjectId.isValid(channelId)
    );

    if (hasInvalidChannelId) {
      return res.status(400).json({
        success: false,
        message: "assignedChannels contains an invalid channel id",
      });
    }

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (uniqueChannelIds.length > 0) {
      const existingChannelsCount = await Channel.countDocuments({
        _id: { $in: uniqueChannelIds },
      });

      if (existingChannelsCount !== uniqueChannelIds.length) {
        return res.status(404).json({
          success: false,
          message: "One or more channels were not found",
        });
      }
    }

    const previousChannelIds = Array.isArray(user.assignedChannels)
      ? user.assignedChannels.map(String)
      : [];
    const newlyAssignedChannelIds = uniqueChannelIds.filter(
      (channelId) => !previousChannelIds.includes(channelId)
    );

    user.assignedChannels = hasAllChannelAccess(user.role) ? null : uniqueChannelIds;
    await user.save();

    const createdNotificationsCount = await createPendingWorkNotificationsForUser(
      user,
      newlyAssignedChannelIds
    );

    return res.status(200).json({
      success: true,
      message: "Channel access updated successfully",
      user: formatUser(user),
      createdNotificationsCount,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
