import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { Jimp } from "jimp";
import { PRODUCTS_DIR } from "../ai/consultant";
import { logger } from "../lib/logger";

const router = Router();

const MAX_SIDE = 800;
const JPEG_QUALITY = 82;

const cache = new Map<string, Buffer>();

router.get("/*splat", async (req, res) => {
  const splat = req.params["splat"];
  const rel = decodeURIComponent(Array.isArray(splat) ? splat.join("/") : (splat ?? ""));
  const absPath = path.resolve(PRODUCTS_DIR, rel);

  if (!absPath.startsWith(PRODUCTS_DIR)) {
    res.status(403).end();
    return;
  }

  if (!fs.existsSync(absPath)) {
    res.status(404).end();
    return;
  }

  if (cache.has(rel)) {
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.end(cache.get(rel)!);
    return;
  }

  try {
    const img = await Jimp.read(absPath);
    const { width, height } = img.bitmap;

    if (width > MAX_SIDE || height > MAX_SIDE) {
      if (width >= height) {
        img.resize({ w: MAX_SIDE });
      } else {
        img.resize({ h: MAX_SIDE });
      }
    }

    const buf = await img.getBuffer("image/jpeg", { quality: JPEG_QUALITY });
    cache.set(rel, buf);
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.end(buf);
  } catch (err) {
    logger.error({ err, rel }, "thumb: failed to process image");
    res.status(500).end();
  }
});

export default router;
