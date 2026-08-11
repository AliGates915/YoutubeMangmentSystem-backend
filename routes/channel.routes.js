import express from "express";
import { createChannel, getChannels } from "../controllers/channel.controller.js";
import { protect, requireAdmin } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/", protect, getChannels);
router.post("/", protect, requireAdmin, createChannel);

export default router;
