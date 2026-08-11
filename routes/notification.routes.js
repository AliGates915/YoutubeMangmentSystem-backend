import express from "express";
import {
  acceptNotification,
  getMyNotifications,
} from "../controllers/notification.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/", protect, getMyNotifications);
router.patch("/:id/accept", protect, acceptNotification);

export default router;
