import express from "express";
import cors from "cors";

const app = express();

app.use(cors({
  origin: process.env.CORS_ORIGIN,
  credentials: true
}));

app.set("trust proxy", 1);

app.use(express.static("public"));

app.use(express.json({limit: "2mb"}));

app.use(express.urlencoded({extended: true, limit: "2mb"}));


import pageInfoRouter from "./route/pageInfo.route.js";

app.use('/api/v1/urlData', pageInfoRouter);

export {app};