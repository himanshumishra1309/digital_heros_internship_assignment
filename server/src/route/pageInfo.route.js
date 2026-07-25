import express from "express";
import { fetchPageInfo } from "../controller/pageInfo.controller.js";

const router = express.Router();

router.post('/pageInfo', fetchPageInfo);

export default router;