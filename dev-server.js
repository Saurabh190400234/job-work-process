const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const port = Number(process.env.PORT || 8080);
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
};

http
  .createServer((request, response) => {
    const cleanUrl = request.url.split("?")[0];
    const file = cleanUrl === "/" ? "index.html" : decodeURIComponent(cleanUrl.slice(1));
    const fullPath = path.normalize(path.join(root, file));

    if (!fullPath.startsWith(root)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    fs.readFile(fullPath, (error, data) => {
      if (error) {
        response.writeHead(404);
        response.end("Not found");
        return;
      }

      response.writeHead(200, {
        "Content-Type": types[path.extname(fullPath)] || "application/octet-stream",
      });
      response.end(data);
    });
  })
  .listen(port, "127.0.0.1", () => {
    console.log(`Job Work Process running at http://localhost:${port}`);
  });
