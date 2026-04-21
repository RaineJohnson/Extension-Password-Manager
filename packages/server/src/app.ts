import express from "express";
import helmet from "helmet";
import cors from "cors";
import { corsOptions } from "./config/cors";
import authRoutes from "./routes/auth";
import vaultRoutes from "./routes/vault";

const app = express();

app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/auth", authRoutes);
app.use("/vault", vaultRoutes);

export default app;
