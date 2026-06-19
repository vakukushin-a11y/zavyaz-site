import { Router, type IRouter } from "express";
import fs from "fs";
import path from "path";
import { PRODUCTS_DIR } from "../ai/consultant";

const router: IRouter = Router();

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const SKIP_CATEGORIES = new Set(["Приветственное слово"]);

router.get("/products/categories", (req, res) => {
  if (!fs.existsSync(PRODUCTS_DIR)) {
    res.json([]);
    return;
  }
  const entries = fs.readdirSync(PRODUCTS_DIR, { withFileTypes: true });
  const categories = entries
    .filter((e) => e.isDirectory() && !SKIP_CATEGORIES.has(e.name))
    .map((e) => {
      const photoDir = path.join(PRODUCTS_DIR, e.name, "Фотоизображения");
      const images: string[] = fs.existsSync(photoDir)
        ? fs
            .readdirSync(photoDir)
            .filter((f) => IMAGE_EXTS.has(path.extname(f).toLowerCase()))
            .map(
              (f) =>
                `/api/products-files/${encodeURIComponent(e.name)}/${encodeURIComponent("Фотоизображения")}/${encodeURIComponent(f)}`
            )
        : [];
      return { name: e.name, images };
    })
    .filter((c) => c.images.length > 0);
  res.json(categories);
});

export default router;
