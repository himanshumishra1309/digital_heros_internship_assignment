import express from "express";
import { fetchPageInfo } from "../controller/pageInfo.controller.js";
import { rateLimiterMiddleware } from "../middleware/rateLimiter.middleware.js";

const router = express.Router();

router.post('/pageInfo', rateLimiterMiddleware, fetchPageInfo);

export default router;