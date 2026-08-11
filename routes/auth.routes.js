import express from "express";
import {
  loginUser,
  logoutUser,
  setupAdmin,
} from "../controllers/auth.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post("/login", loginUser);
router.post("/logout", protect, logoutUser);
router.post("/setup-admin", setupAdmin);

export default router;
