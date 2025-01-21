/* eslint-disable */

const { createServer } = require("http");
const express = require("express");
const cors = require("cors");
const { createProxyMiddleware } = require("http-proxy-middleware");

const app = express();

app.use(cors({ origin: "http://127.0.0.1:3000" }));

const proxyMiddleware = createProxyMiddleware({
  target: "http://127.0.0.1:8998",
  changeOrigin: true,
  ws: true,
  on: {
    proxyRes: (proxyRes, req, res) => {
      res.setHeader("access-control-allow-origin", "http://127.0.0.1:3000");
      res.setHeader("access-control-allow-headers", "authorization");
    },
  },
});

app.use(proxyMiddleware);

const server = createServer(app);

server.listen(3001, "127.0.0.1", () => {
  console.log(`Listening at http://127.0.0.1:3001`);
});

server.on("upgrade", proxyMiddleware.upgrade);
