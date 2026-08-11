import express from "express";
import {
  createUser,
  deleteUser,
  getUsers,
  updateUserChannelAccess,
} from "../controllers/user.controller.js";
import {
  protect,
  requireAdmin,
  requireAdminOrSubadmin,
} from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/", protect, requireAdminOrSubadmin, getUsers);
router.post("/", protect, requireAdmin, createUser);
router.patch("/:id/channels", protect, requireAdminOrSubadmin, updateUserChannelAccess);
router.delete("/:id", protect, requireAdminOrSubadmin, deleteUser);

export default router;
