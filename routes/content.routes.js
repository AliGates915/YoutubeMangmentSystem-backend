import express from "express";
import {
  checkSourceUrl,
  createContent,
  deleteContent,
  getContentActivityHistory,
  getContentOptions,
  getCompletedContents,
  getContents,
  updateContent,
} from "../controllers/content.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/", protect, getContents);
router.get("/options", protect, getContentOptions);
router.get("/check-source-url", protect, checkSourceUrl);
router.get("/completed-work", protect, getCompletedContents);
router.get("/:id/activity-history", protect, getContentActivityHistory);
router.post("/", protect, createContent);
router.patch("/:id", protect, updateContent);
router.delete("/:id", protect, deleteContent);

export default router;
