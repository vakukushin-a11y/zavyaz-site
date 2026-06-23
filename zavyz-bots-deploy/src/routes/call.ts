import { Router, type IRouter } from "express";

const router: IRouter = Router();

const DESIGNER_PHONE = "+79222019199";

router.get("/call-designer", (_req, res) => {
  res.redirect(302, `tel:${DESIGNER_PHONE}`);
});

export default router;
