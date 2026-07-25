import express from "express";
import cors from "cors";

const app = express();

app.use(cors({
  origin: process.env.CORS_ORIGIN,
  credentials: true
}));

app.use(express.static("public"));

app.use(express.json({limit: "2mb"}));

app.use(express.urlencoded({extended: true, limit: "2mb"}));

export {app};