import mongoose from "mongoose";
import Channel from "../models/channel.model.js";
import Content from "../models/content.model.js";
import Notification from "../models/notification.model.js";
import User from "../models/user.model.js";

const allowedPriorities = ["High", "Medium", "Low"];
const allowedStatuses = ["Pending", "In Progress", "Completed"];
const workflowRoles = ["script_writer", "editor", "uploader"];
const youtubeVideoIdPattern = /^[a-zA-Z0-9_-]{11}$/;
const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = MS_PER_SECOND * 60;
const MS_PER_HOUR = 1000 * 60 * 60;
const MS_PER_DAY = MS_PER_HOUR * 24;

const extractYouTubeVideoId = (sourceUrl) => {
  const trimmedUrl = String(sourceUrl || "").trim();

  if (youtubeVideoIdPattern.test(trimmedUrl)) {
    return trimmedUrl;
  }

  try {
    const url = new URL(
      trimmedUrl.startsWith("http://") || trimmedUrl.startsWith("https://")
        ? trimmedUrl
        : `https://${trimmedUrl}`
    );
    const hostname = url.hostname.replace(/^www\./, "").toLowerCase();

    if (hostname === "youtu.be") {
      const videoId = url.pathname.split("/").filter(Boolean)[0];
      return youtubeVideoIdPattern.test(videoId) ? videoId : null;
    }

    if (!hostname.endsWith("youtube.com")) {
      return null;
    }

    const watchVideoId = url.searchParams.get("v");

    if (youtubeVideoIdPattern.test(watchVideoId)) {
      return watchVideoId;
    }

    const pathParts = url.pathname.split("/").filter(Boolean);

    if (["shorts", "embed", "live", "v"].includes(pathParts[0])) {
      return youtubeVideoIdPattern.test(pathParts[1]) ? pathParts[1] : null;
    }

    return null;
  } catch {
    return null;
  }
};

const findDuplicateSourceContent = async (sourceVideoId, sourceUrl, ignoredContentId = null) => {
  const trimmedSourceUrl = String(sourceUrl || "").trim();
  const duplicateFilter = {
    $or: [{ sourceVideoId }, { sourceUrl: trimmedSourceUrl }],
  };

  if (ignoredContentId) {
    duplicateFilter._id = { $ne: ignoredContentId };
  }

  const directDuplicate = await Content.findOne(duplicateFilter).select("_id");

  if (directDuplicate) {
    return directDuplicate;
  }

  const legacyContents = await Content.find({
    $or: [{ sourceVideoId: { $exists: false } }, { sourceVideoId: null }, { sourceVideoId: "" }],
  })
    .select("sourceUrl")
    .lean();

  return legacyContents.find(
    (content) =>
      String(content._id) !== String(ignoredContentId) &&
      extractYouTubeVideoId(content.sourceUrl) === sourceVideoId
  );
};

const formatContentForTable = (content) => ({
  id: content._id,
  title: content.videoTitle,
  sourceUrl: content.sourceUrl,
  sourceVideoId: content.sourceVideoId,
  channel: content.channel
    ? {
        id: content.channel._id,
        name: content.channel.channelName,
        niche: content.channel.categoryNiche,
        avatarEmoji: content.channel.channelAvatarEmoji,
      }
    : null,
  status: content.status,
  priority: content.priority,
  type: content.contentType,
  workflowStage: content.workflowStage || content.assignedUser?.role || "script_writer",
  assignedTo: content.assignedUser
    ? {
        id: content.assignedUser._id,
        fullName: content.assignedUser.fullName,
        email: content.assignedUser.email,
        role: content.assignedUser.role,
      }
    : null,
  sourceCreator: content.sourceCreator,
  createdAt: content.createdAt,
  updatedAt: content.updatedAt,
});

const formatCompletedContentForTable = (content, completedEntry) => ({
  ...formatContentForTable(content),
  status: completedEntry?.status || "Completed",
  completedStage: completedEntry?.stageRole || null,
  completedAt: completedEntry?.changedAt || null,
  completedBy: completedEntry?.changedBy
    ? {
        id: completedEntry.changedBy._id || completedEntry.changedBy,
        fullName: completedEntry.changedBy.fullName,
        email: completedEntry.changedBy.email,
        role: completedEntry.changedBy.role,
      }
    : null,
});

const getEntityId = (entity) => entity?._id || entity;

const getDurationParts = (durationMs) => {
  const safeDurationMs = Math.max(0, durationMs);
  const totalSeconds = Math.floor(safeDurationMs / MS_PER_SECOND);
  const days = Math.floor(totalSeconds / (60 * 60 * 24));
  const hours = Math.floor((totalSeconds % (60 * 60 * 24)) / (60 * 60));
  const minutes = Math.floor((totalSeconds % (60 * 60)) / 60);
  const seconds = totalSeconds % 60;

  return {
    totalSeconds,
    totalMinutes: Math.floor(safeDurationMs / MS_PER_MINUTE),
    totalHours: Math.floor(safeDurationMs / MS_PER_HOUR),
    totalDays: Math.floor(safeDurationMs / MS_PER_DAY),
    days,
    hours,
    minutes,
    seconds,
  };
};

const pluralizeDuration = (value, unit) => `${value} ${unit}${value === 1 ? "" : "s"}`;

const formatDuration = (durationMs) => {
  const { days, hours, minutes, seconds } = getDurationParts(durationMs);
  const parts = [];

  if (days) parts.push(pluralizeDuration(days, "day"));
  if (hours) parts.push(pluralizeDuration(hours, "hour"));
  if (minutes && parts.length < 2) parts.push(pluralizeDuration(minutes, "minute"));
  if (!parts.length) parts.push(pluralizeDuration(seconds, "second"));

  return parts.slice(0, 2).join(" ");
};

const getStatusHistoryEntries = (content) => {
  const history = Array.isArray(content.statusHistory) ? content.statusHistory : [];

  if (history.length) {
    return history
      .map((entry) => ({
        status: entry.status,
        fromStatus: entry.fromStatus || null,
        changedAt: entry.changedAt || content.createdAt,
        changedBy: entry.changedBy || null,
        stageRole: entry.stageRole || content.workflowStage || "script_writer",
      }))
      .sort((a, b) => new Date(a.changedAt) - new Date(b.changedAt));
  }

  return [
    {
      status: content.status || "Pending",
      fromStatus: null,
      changedAt: content.createdAt,
      changedBy: content.createdBy || null,
      stageRole: content.workflowStage || "script_writer",
    },
  ];
};

const formatChangedBy = (changedBy) => {
  if (!changedBy) return null;
  return {
    id: changedBy._id || changedBy,
    fullName: changedBy.fullName,
    email: changedBy.email,
    role: changedBy.role,
  };
};

const buildActivityHistory = (content) => {
  const entries = getStatusHistoryEntries(content);
  const now = new Date();
  const latestEntry = entries[entries.length - 1];
  const totalEndAt =
    content.workflowStage === "done" || latestEntry?.status === "Completed"
      ? latestEntry.changedAt
      : now;
  const totalMs = Math.max(0, new Date(totalEndAt) - new Date(entries[0].changedAt));

  const statusTotals = allowedStatuses.reduce((totals, status) => {
    totals[status] = {
      duration: "0 seconds",
      totalSeconds: 0,
      totalMinutes: 0,
      hours: 0,
      days: 0,
    };
    return totals;
  }, {});

  const history = entries.map((entry, index) => {
    const nextEntry = entries[index + 1];
    const endAt = nextEntry?.changedAt || (entry.status === "Completed" ? entry.changedAt : now);
    const durationMs = Math.max(0, new Date(endAt) - new Date(entry.changedAt));
    const durationParts = getDurationParts(durationMs);

    statusTotals[entry.status].totalSeconds += durationParts.totalSeconds;
    statusTotals[entry.status].totalMinutes = Math.floor(
      statusTotals[entry.status].totalSeconds / 60
    );
    statusTotals[entry.status].hours = Math.floor(
      statusTotals[entry.status].totalSeconds / (60 * 60)
    );
    statusTotals[entry.status].days = Math.floor(
      statusTotals[entry.status].totalSeconds / (60 * 60 * 24)
    );
    statusTotals[entry.status].duration = formatDuration(
      statusTotals[entry.status].totalSeconds * MS_PER_SECOND
    );

    return {
      status: entry.status,
      fromStatus: entry.fromStatus,
      stageRole: entry.stageRole,
      transition: entry.fromStatus ? `${entry.fromStatus} -> ${entry.status}` : entry.status,
      dateTime: entry.changedAt,
      startedAt: entry.changedAt,
      endedAt: endAt,
      isCurrent: index === entries.length - 1,
      duration: formatDuration(durationMs),
      totalSeconds: durationParts.totalSeconds,
      totalMinutes: durationParts.totalMinutes,
      hours: durationParts.totalHours,
      days: durationParts.totalDays,
      changedBy: formatChangedBy(entry.changedBy),
    };
  });
  const totalDurationParts = getDurationParts(totalMs);

  return {
    history,
    statusTotals,
    totalDuration: formatDuration(totalMs),
    totalSeconds: totalDurationParts.totalSeconds,
    totalMinutes: totalDurationParts.totalMinutes,
    totalHours: totalDurationParts.totalHours,
    totalDays: totalDurationParts.totalDays,
  };
};

const buildScopedActivityResponse = (activity, role) => {
  const activityHistory = workflowRoles.includes(role)
    ? activity.history.filter((entry) => entry.stageRole === role)
    : activity.history;

  const statusTotals = allowedStatuses.reduce((totals, status) => {
    totals[status] = {
      duration: "0 seconds",
      totalSeconds: 0,
      totalMinutes: 0,
      hours: 0,
      days: 0,
    };
    return totals;
  }, {});

  let totalSeconds = 0;

  activityHistory.forEach((entry) => {
    statusTotals[entry.status].totalSeconds += entry.totalSeconds;
    totalSeconds += entry.totalSeconds;
  });

  allowedStatuses.forEach((status) => {
    const seconds = statusTotals[status].totalSeconds;
    statusTotals[status].totalMinutes = Math.floor(seconds / 60);
    statusTotals[status].hours = Math.floor(seconds / (60 * 60));
    statusTotals[status].days = Math.floor(seconds / (60 * 60 * 24));
    statusTotals[status].duration = formatDuration(seconds * MS_PER_SECOND);
  });

  const totalDurationParts = getDurationParts(totalSeconds * MS_PER_SECOND);

  return {
    activityHistory,
    statusTotals,
    totalDuration: formatDuration(totalSeconds * MS_PER_SECOND),
    totalSeconds,
    totalMinutes: totalDurationParts.totalMinutes,
    totalHours: totalDurationParts.totalHours,
    totalDays: totalDurationParts.totalDays,
  };
};

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const getNextWorkflowRole = (role) => {
  if (role === "script_writer") return "editor";
  if (role === "editor") return "uploader";
  return null;
};

const getUserAssignedChannelIds = (user) => {
  if (!user) return [];
  if (["admin", "subadmin"].includes(user.role)) return null;
  if (!Array.isArray(user.assignedChannels)) return [];
  return user.assignedChannels.map(String);
};

const hasChannelAccess = (user, channelId) => {
  if (["admin", "subadmin"].includes(user.role)) return true;
  const assignedChannelIds = getUserAssignedChannelIds(user);

  if (!assignedChannelIds || !channelId) {
    return false;
  }

  return assignedChannelIds.includes(String(channelId));
};

const hasContentAccess = (user, content) => {
  if (["admin", "subadmin"].includes(user.role)) return true;
  return (
    hasChannelAccess(user, getEntityId(content.channel)) &&
    String(getEntityId(content.assignedUser)) === String(user._id)
  );
};

const hasCompletedContentAccess = (user, content) => {
  if (["admin", "subadmin"].includes(user.role)) return true;

  if (!hasChannelAccess(user, getEntityId(content.channel))) {
    return false;
  }

  return content.statusHistory.some(
    (entry) =>
      entry.status === "Completed" &&
      entry.stageRole === user.role &&
      String(getEntityId(entry.changedBy)) === String(user._id)
  );
};

const getEligibleUsersForStage = async (role, channelId) => {
  const users = await User.find({
    role,
    accountStatus: "active",
    assignedChannels: channelId,
  }).select("_id fullName email role assignedChannels");

  return users.filter((user) => hasChannelAccess(user, channelId));
};

const createStageNotifications = async ({ content, fromUser, targetRole }) => {
  const recipients = await getEligibleUsersForStage(targetRole, content.channel);

  if (!recipients.length) {
    return [];
  }

  const message = `New ${targetRole.replace("_", " ")} work assigned by ${fromUser.fullName}`;

  await Notification.updateMany(
    {
      content: content._id,
      targetRole,
      status: "pending",
    },
    { status: "expired" }
  );

  return Notification.insertMany(
    recipients.map((recipient) => ({
      content: content._id,
      recipient: recipient._id,
      fromUser: fromUser._id,
      targetRole,
      message,
    }))
  );
};

const canModifyContent = (user, content) => {
  if (["admin", "subadmin"].includes(user.role)) return true;
  return content.status === "Pending";
};

export const getContentOptions = async (req, res) => {
  try {
    const channelFilter = {};
    const assignedChannelIds = getUserAssignedChannelIds(req.user);

    if (assignedChannelIds !== null) {
      if (!assignedChannelIds.length) {
        return res.status(200).json({
          success: true,
          channels: [],
          users: [],
        });
      }
      channelFilter._id = { $in: assignedChannelIds };
    }

    const userFilter = ["admin", "subadmin"].includes(req.user.role)
      ? { accountStatus: "active" }
      : { _id: req.user._id, accountStatus: "active" };

    const [channels, users] = await Promise.all([
      Channel.find(channelFilter).select("channelName categoryNiche channelAvatarEmoji contentType").sort({ channelName: 1 }),
      User.find(userFilter).select("fullName email role").sort({ fullName: 1 }),
    ]);

    return res.status(200).json({
      success: true,
      channels: channels.map((channel) => ({
        id: channel._id,
        label: `${channel.channelAvatarEmoji} ${channel.channelName} (${channel.categoryNiche})`,
        channelName: channel.channelName,
        categoryNiche: channel.categoryNiche,
        channelAvatarEmoji: channel.channelAvatarEmoji,
        contentType: channel.contentType,
      })),
      users: users.map((user) => ({
        id: user._id,
        label: `${user.fullName} (${user.role})`,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
      })),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const checkSourceUrl = async (req, res) => {
  try {
    const { sourceUrl } = req.query;

    if (!sourceUrl) {
      return res.status(400).json({
        success: false,
        message: "sourceUrl is required",
      });
    }

    const sourceVideoId = extractYouTubeVideoId(sourceUrl);

    if (!sourceVideoId) {
      return res.status(400).json({
        success: false,
        message: "Valid YouTube sourceUrl is required",
      });
    }

    const existingContent = await findDuplicateSourceContent(sourceVideoId, sourceUrl);

    if (existingContent) {
      return res.status(409).json({
        success: false,
        duplicate: true,
        message: "Duplicate YouTube video found",
      });
    }

    return res.status(200).json({
      success: true,
      duplicate: false,
      sourceVideoId,
      message: "Unique YouTube video detected successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const createContent = async (req, res) => {
  try {
    const {
      channel,
      channelId,
      sourceUrl,
      videoTitle,
      sourceCreator,
      priority = "Medium",
      status = "Pending",
      initialStatus,
      assignedUser,
      assignedUserId,
    } = req.body;

    const finalChannelId = channelId || channel;
    const finalAssignedUserId = assignedUserId || assignedUser;
    const finalStatus = initialStatus || status;

    if (!finalChannelId || !sourceUrl || !videoTitle || !sourceCreator || !finalAssignedUserId) {
      return res.status(400).json({
        success: false,
        message: "channelId, sourceUrl, videoTitle, sourceCreator and assignedUserId are required",
      });
    }

    if (!isValidObjectId(finalChannelId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid channel id",
      });
    }

    if (!isValidObjectId(finalAssignedUserId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid assigned user id",
      });
    }

    if (!allowedPriorities.includes(priority)) {
      return res.status(400).json({
        success: false,
        message: "priority must be High, Medium or Low",
      });
    }

    if (!allowedStatuses.includes(finalStatus)) {
      return res.status(400).json({
        success: false,
        message: "status must be Pending, In Progress or Completed",
      });
    }

    const selectedChannel = await Channel.findById(finalChannelId);

    if (!selectedChannel) {
      return res.status(404).json({
        success: false,
        message: "Channel not found",
      });
    }

    if (!hasChannelAccess(req.user, selectedChannel._id)) {
      return res.status(403).json({
        success: false,
        message: "You do not have access to this channel",
      });
    }

    const selectedUser = await User.findById(finalAssignedUserId);

    if (!selectedUser) {
      return res.status(404).json({
        success: false,
        message: "Assigned user not found",
      });
    }

    if (!workflowRoles.includes(selectedUser.role)) {
      return res.status(400).json({
        success: false,
        message: "Content can only be assigned to script_writer, editor or uploader",
      });
    }

    if (!hasChannelAccess(selectedUser, selectedChannel._id)) {
      return res.status(400).json({
        success: false,
        message: "Assigned user does not have access to this channel",
      });
    }

    const trimmedSourceUrl = sourceUrl.trim();
    const sourceVideoId = extractYouTubeVideoId(trimmedSourceUrl);

    if (!sourceVideoId) {
      return res.status(400).json({
        success: false,
        message: "Valid YouTube sourceUrl is required",
      });
    }

    const existingContent = await findDuplicateSourceContent(sourceVideoId, trimmedSourceUrl);

    if (existingContent) {
      return res.status(409).json({
        success: false,
        duplicate: true,
        message: "Duplicate YouTube video found",
      });
    }

    const content = await Content.create({
      channel: selectedChannel._id,
      sourceUrl: trimmedSourceUrl,
      sourceVideoId,
      videoTitle,
      sourceCreator,
      contentType: selectedChannel.contentType,
      priority,
      status: finalStatus,
      workflowStage: selectedUser.role,
      statusHistory: [
        {
          status: finalStatus,
          fromStatus: null,
          changedAt: new Date(),
          changedBy: req.user._id,
          stageRole: selectedUser.role,
        },
      ],
      assignedUser: selectedUser._id,
      createdBy: req.user._id,
    });

    const populatedContent = await Content.findById(content._id)
      .populate("channel", "channelName categoryNiche channelAvatarEmoji contentType")
      .populate("assignedUser", "fullName email role");

    return res.status(201).json({
      success: true,
      message: "Content record created successfully",
      content: formatContentForTable(populatedContent),
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        duplicate: true,
        message: "Duplicate YouTube video found",
      });
    }

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const updateContent = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid content id",
      });
    }

    const content = await Content.findById(id);

    if (!content) {
      return res.status(404).json({
        success: false,
        message: "Content record not found",
      });
    }

    if (!hasContentAccess(req.user, content)) {
      return res.status(403).json({
        success: false,
        message: "You do not have access to this content",
      });
    }

    const {
      channel,
      channelId,
      sourceUrl,
      videoTitle,
      sourceCreator,
      priority,
      status,
      initialStatus,
      assignedUser,
      assignedUserId,
    } = req.body;

    const finalChannelId = channelId || channel;
    const finalAssignedUserId = assignedUserId || assignedUser;
    const finalStatus = initialStatus || status;
    const previousStatus = content.status;
    let handoffTargetRole = null;

    let selectedChannel = null;
    let selectedUser = null;

    if (finalChannelId !== undefined) {
      if (!isValidObjectId(finalChannelId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid channel id",
        });
      }

      selectedChannel = await Channel.findById(finalChannelId);

      if (!selectedChannel) {
        return res.status(404).json({
          success: false,
          message: "Channel not found",
        });
      }

      if (!hasChannelAccess(req.user, selectedChannel._id)) {
        return res.status(403).json({
          success: false,
          message: "You do not have access to this channel",
        });
      }

      content.channel = selectedChannel._id;
      content.contentType = selectedChannel.contentType;
    }

    if (finalAssignedUserId !== undefined) {
      if (!["admin", "subadmin"].includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: "Only admin or subadmin can reassign content",
        });
      }

      if (!isValidObjectId(finalAssignedUserId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid assigned user id",
        });
      }

      selectedUser = await User.findById(finalAssignedUserId);

      if (!selectedUser) {
        return res.status(404).json({
          success: false,
          message: "Assigned user not found",
        });
      }

      content.assignedUser = selectedUser._id;
    }

    if (selectedChannel || selectedUser) {
      const finalContentChannel = selectedChannel?._id || content.channel;
      const finalAssignedUser = selectedUser || (await User.findById(content.assignedUser));

      if (!hasChannelAccess(finalAssignedUser, finalContentChannel)) {
        return res.status(400).json({
          success: false,
          message: "Assigned user does not have access to this channel",
        });
      }
    }

    if (sourceUrl !== undefined) {
      const trimmedSourceUrl = sourceUrl.trim();
      const sourceVideoId = extractYouTubeVideoId(trimmedSourceUrl);

      if (!sourceVideoId) {
        return res.status(400).json({
          success: false,
          message: "Valid YouTube sourceUrl is required",
        });
      }

      const existingContent = await findDuplicateSourceContent(
        sourceVideoId,
        trimmedSourceUrl,
        content._id
      );

      if (existingContent) {
        return res.status(409).json({
          success: false,
          duplicate: true,
          message: "Duplicate YouTube video found",
        });
      }

      content.sourceUrl = trimmedSourceUrl;
      content.sourceVideoId = sourceVideoId;
    }

    if (videoTitle !== undefined) {
      if (!videoTitle.trim()) {
        return res.status(400).json({
          success: false,
          message: "videoTitle is required",
        });
      }

      content.videoTitle = videoTitle;
    }

    if (sourceCreator !== undefined) {
      if (!sourceCreator.trim()) {
        return res.status(400).json({
          success: false,
          message: "sourceCreator is required",
        });
      }

      content.sourceCreator = sourceCreator;
    }

    if (priority !== undefined) {
      if (!allowedPriorities.includes(priority)) {
        return res.status(400).json({
          success: false,
          message: "priority must be High, Medium or Low",
        });
      }

      content.priority = priority;
    }

    if (finalStatus !== undefined) {
      if (!allowedStatuses.includes(finalStatus)) {
        return res.status(400).json({
          success: false,
          message: "status must be Pending, In Progress or Completed",
        });
      }

      if (finalStatus !== previousStatus) {
        if (!content.statusHistory.length) {
          content.statusHistory.push({
            status: previousStatus,
            fromStatus: null,
            changedAt: content.createdAt,
            changedBy: content.createdBy,
            stageRole: content.workflowStage || req.user.role,
          });
        }

        content.status = finalStatus;
        content.statusHistory.push({
          status: finalStatus,
          fromStatus: previousStatus,
          changedAt: new Date(),
          changedBy: req.user._id,
          stageRole: content.workflowStage || req.user.role,
        });

        if (finalStatus === "Completed") {
          const completedStage = content.workflowStage || req.user.role;
          const nextStage = getNextWorkflowRole(completedStage);

          if (nextStage) {
            handoffTargetRole = nextStage;
            content.workflowStage = nextStage;
            content.assignedUser = null;
            content.status = "Pending";
          } else {
            content.workflowStage = "done";
            content.assignedUser = null;
          }
        }
      }
    }

    await content.save();

    if (handoffTargetRole) {
      await createStageNotifications({
        content,
        fromUser: req.user,
        targetRole: handoffTargetRole,
      });
    }

    const populatedContent = await Content.findById(content._id)
      .populate("channel", "channelName categoryNiche channelAvatarEmoji contentType")
      .populate("assignedUser", "fullName email role");

    return res.status(200).json({
      success: true,
      message: "Content record updated successfully",
      content: formatContentForTable(populatedContent),
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        duplicate: true,
        message: "Duplicate YouTube video found",
      });
    }

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getContentActivityHistory = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid content id",
      });
    }

    const content = await Content.findById(id)
      .populate("channel", "channelName categoryNiche channelAvatarEmoji contentType")
      .populate("assignedUser", "fullName email role")
      .populate("createdBy", "fullName email role")
      .populate("statusHistory.changedBy", "fullName email role");

    if (!content) {
      return res.status(404).json({
        success: false,
        message: "Content record not found",
      });
    }

    if (!hasContentAccess(req.user, content) && !hasCompletedContentAccess(req.user, content)) {
      return res.status(403).json({
        success: false,
        message: "You do not have access to this content",
      });
    }

    const activity = buildActivityHistory(content);
    const scopedActivity = buildScopedActivityResponse(activity, req.user.role);

    return res.status(200).json({
      success: true,
      content: formatContentForTable(content),
      activityHistory: scopedActivity.activityHistory,
      statusTotals: scopedActivity.statusTotals,
      totalDuration: scopedActivity.totalDuration,
      totalSeconds: scopedActivity.totalSeconds,
      totalMinutes: scopedActivity.totalMinutes,
      totalHours: scopedActivity.totalHours,
      totalDays: scopedActivity.totalDays,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const deleteContent = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid content id",
      });
    }

    const content = await Content.findById(id);

    if (!content) {
      return res.status(404).json({
        success: false,
        message: "Content record not found",
      });
    }

    if (!hasContentAccess(req.user, content)) {
      return res.status(403).json({
        success: false,
        message: "You do not have access to this content",
      });
    }

    if (content.status !== "Pending") {
      return res.status(403).json({
        success: false,
        message: "Only Pending content can be deleted",
      });
    }

    await content.deleteOne();

    return res.status(200).json({
      success: true,
      message: "Content record deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getCompletedContents = async (req, res) => {
  try {
    const { search, channel, priority, role, completedBy, userId } = req.query;
    const completedById = completedBy || userId;
    const filter = {};
    const assignedChannelIds = getUserAssignedChannelIds(req.user);
    const completionMatch = { status: "Completed" };

    if (assignedChannelIds !== null) {
      if (!assignedChannelIds.length) {
        return res.status(200).json({
          success: true,
          count: 0,
          contents: [],
        });
      }

      filter.channel = { $in: assignedChannelIds };
      completionMatch.changedBy = req.user._id;
      completionMatch.stageRole = req.user.role;
    }

    if (role && role !== "all") {
      if (!workflowRoles.includes(role)) {
        return res.status(400).json({
          success: false,
          message: "role must be script_writer, editor or uploader",
        });
      }

      if (assignedChannelIds !== null && role !== req.user.role) {
        return res.status(403).json({
          success: false,
          message: "You can only view completed work for your own role",
        });
      }

      completionMatch.stageRole = role;
    }

    if (completedById && completedById !== "all") {
      if (!isValidObjectId(completedById)) {
        return res.status(400).json({
          success: false,
          message: "Invalid completedBy user id",
        });
      }

      if (assignedChannelIds !== null && String(completedById) !== String(req.user._id)) {
        return res.status(403).json({
          success: false,
          message: "You can only view your own completed work",
        });
      }

      completionMatch.changedBy = completedById;
    }

    if (channel && channel !== "all") {
      if (!isValidObjectId(channel)) {
        return res.status(400).json({
          success: false,
          message: "Invalid channel id",
        });
      }

      if (assignedChannelIds !== null && !assignedChannelIds.includes(String(channel))) {
        return res.status(403).json({
          success: false,
          message: "You do not have access to this channel",
        });
      }

      filter.channel = channel;
    }

    if (priority && priority !== "all") {
      if (!allowedPriorities.includes(priority)) {
        return res.status(400).json({
          success: false,
          message: "priority must be High, Medium or Low",
        });
      }

      filter.priority = priority;
    }

    if (search) {
      const searchRegex = new RegExp(search, "i");
      filter.$or = [{ videoTitle: searchRegex }, { sourceCreator: searchRegex }];

      if (isValidObjectId(search)) {
        filter.$or.push({ _id: search });
      }
    }

    filter.statusHistory = { $elemMatch: completionMatch };

    const contents = await Content.find(filter)
      .populate("channel", "channelName categoryNiche channelAvatarEmoji contentType")
      .populate("assignedUser", "fullName email role")
      .populate("statusHistory.changedBy", "fullName email role")
      .sort({ updatedAt: -1 });

    const completedContents = contents
      .map((content) => {
        const completedEntries = content.statusHistory
          .filter((entry) => {
            if (entry.status !== "Completed") return false;
            if (completionMatch.stageRole && entry.stageRole !== completionMatch.stageRole) {
              return false;
            }
            if (
              completionMatch.changedBy &&
              String(getEntityId(entry.changedBy)) !== String(completionMatch.changedBy)
            ) {
              return false;
            }
            return true;
          })
          .sort((a, b) => new Date(b.changedAt) - new Date(a.changedAt));

        return {
          content,
          completedEntry: completedEntries[0],
        };
      })
      .filter(({ completedEntry }) => completedEntry)
      .sort((a, b) => new Date(b.completedEntry.changedAt) - new Date(a.completedEntry.changedAt))
      .map(({ content, completedEntry }) =>
        formatCompletedContentForTable(content, completedEntry)
      );

    return res.status(200).json({
      success: true,
      count: completedContents.length,
      contents: completedContents,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getContents = async (req, res) => {
  try {
    const { search, channel, status, priority, assignedUser } = req.query;
    const filter = {};
    const assignedChannelIds = getUserAssignedChannelIds(req.user);

    if (assignedChannelIds !== null) {
      if (!assignedChannelIds.length) {
        return res.status(200).json({
          success: true,
          count: 0,
          contents: [],
        });
      }
      filter.channel = { $in: assignedChannelIds };
      filter.assignedUser = req.user._id;
    }

    if (channel && channel !== "all") {
      if (assignedChannelIds !== null) {
        if (!assignedChannelIds.includes(String(channel))) {
          return res.status(403).json({
            success: false,
            message: "You do not have access to this channel",
          });
        }
      }
      filter.channel = channel;
    }
    if (status && status !== "all") filter.status = status;
    if (priority && priority !== "all") filter.priority = priority;
    if (assignedUser && assignedUser !== "all") {
      if (assignedChannelIds !== null && String(assignedUser) !== String(req.user._id)) {
        return res.status(200).json({
          success: true,
          count: 0,
          contents: [],
        });
      }

      filter.assignedUser = assignedUser;
    }

    if (search) {
      const searchRegex = new RegExp(search, "i");
      filter.$or = [
        { videoTitle: searchRegex },
        { sourceCreator: searchRegex },
      ];

      if (isValidObjectId(search)) {
        filter.$or.push({ _id: search });
      }
    }

    const contents = await Content.find(filter)
      .populate("channel", "channelName categoryNiche channelAvatarEmoji contentType")
      .populate("assignedUser", "fullName email role")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: contents.length,
      contents: contents.map(formatContentForTable),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
