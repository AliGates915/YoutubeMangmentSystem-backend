import Channel from "../models/channel.model.js";

const allowedLanguages = ["English", "Spanish", "German", "Portuguese", "French", "Italian", "Hindi"];
const allowedContentTypes = ["long", "short"];

const formatChannel = (channel) => ({
  id: channel._id,
  channelName: channel.channelName,
  language: channel.language,
  categoryNiche: channel.categoryNiche,
  contentType: channel.contentType,
  channelAvatarEmoji: channel.channelAvatarEmoji,
  createdBy: channel.createdBy,
  createdAt: channel.createdAt,
  updatedAt: channel.updatedAt,
});

export const createChannel = async (req, res) => {
  try {
    const {
      channelName,
      language,
      categoryNiche,
      category,
      niche,
      contentType,
      channelAvatarEmoji,
    } = req.body;

    const finalCategoryNiche = categoryNiche || category || niche;

    if (!channelName || !language || !finalCategoryNiche || !contentType || !channelAvatarEmoji) {
      return res.status(400).json({
        success: false,
        message: "channelName, language, categoryNiche, contentType and channelAvatarEmoji are required",
      });
    }

    if (!allowedLanguages.includes(language)) {
      return res.status(400).json({
        success: false,
        message: "Language must be English, Spanish, German, Portuguese, French, Italian or Hindi",
      });
    }

    if (!allowedContentTypes.includes(contentType)) {
      return res.status(400).json({
        success: false,
        message: "contentType must be long or short",
      });
    }

    const existingChannel = await Channel.findOne({ channelName });

    if (existingChannel) {
      return res.status(409).json({
        success: false,
        message: "Channel with this name already exists",
      });
    }

    const channel = await Channel.create({
      channelName,
      language,
      categoryNiche: finalCategoryNiche,
      contentType,
      channelAvatarEmoji,
      createdBy: req.user._id,
    });

    return res.status(201).json({
      success: true,
      message: "Channel created successfully",
      channel: formatChannel(channel),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getChannels = async (req, res) => {
  try {
    const filter = {};

    if (!["admin", "subadmin"].includes(req.user.role)) {
      const assignedChannels = Array.isArray(req.user.assignedChannels)
        ? req.user.assignedChannels
        : [];

      filter._id = { $in: assignedChannels };
    }

    const channels = await Channel.find(filter)
      .populate("createdBy", "fullName email role")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: channels.length,
      channels: channels.map(formatChannel),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
