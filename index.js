import "dotenv/config";
import express from 'express';
import connectDB from "./config/db.js";
import morgan from "morgan";
import cors from "cors";
import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/user.routes.js";
import channelRoutes from "./routes/channel.routes.js";
import contentRoutes from "./routes/content.routes.js";
import notificationRoutes from "./routes/notification.routes.js";

const app = express();

app.use(cors({
    origin: "http://localhost:3000",
     methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
}));
app.use(express.json());
app.use(morgan("dev"))

app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/channels", channelRoutes);
app.use("/api/contents", contentRoutes);
app.use("/api/notifications", notificationRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, async() => {
    await connectDB();
  console.log(`Server is running on port ${PORT}`);
});
