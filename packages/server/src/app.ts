import express from "express";
import helmet from "helmet";
import cors from "cors";
import { corsOptions } from "./config/cors";
import authRoutes from "./routes/auth";

const app = express();

app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

// Mount auth routes at /auth
app.use("/auth", authRoutes);

export default app;
