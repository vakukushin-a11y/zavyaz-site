import { Router, type IRouter } from "express";
import healthRouter from "./health";
import anthropicRouter from "./anthropic";
import leadsRouter from "./leads";
import productsRouter from "./products";
import newsRouter from "./news";
import knowledgeRouter from "./knowledge";
import callRouter from "./call";
import vkRouter from "./vk";

const router: IRouter = Router();

router.use(healthRouter);
router.use(anthropicRouter);
router.use(leadsRouter);
router.use(productsRouter);
router.use(newsRouter);
router.use(knowledgeRouter);
router.use(callRouter);
router.use(vkRouter);

export default router;
