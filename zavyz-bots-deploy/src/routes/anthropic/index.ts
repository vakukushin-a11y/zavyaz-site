import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, conversations as conversationsTable, messages as messagesTable, leadsTable } from "";
import {
  GetAnthropicConversationParams,
  DeleteAnthropicConversationParams,
  ListAnthropicMessagesParams,
  SendAnthropicMessageParams,
  SendAnthropicMessageBody,
  CreateAnthropicConversationBody,
} from "";
import {
  openai,
  CHAT_MODEL,
  getImagesForKeyword,
  buildSystemPrompt,
} from "../../ai/consultant";
import { notifyAdminOfLead } from "../../telegram/notify";

const router: IRouter = Router();

const HISTORY_LIMIT = 10;

router.get("/anthropic/conversations", async (req, res): Promise<void> => {
  const convs = await db
    .select()
    .from(conversationsTable)
    .orderBy(conversationsTable.createdAt);
  res.json(convs);
});

router.post("/anthropic/conversations", async (req, res): Promise<void> => {
  const parsed = CreateAnthropicConversationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [conv] = await db
    .insert(conversationsTable)
    .values({ title: parsed.data.title })
    .returning();
  res.status(201).json(conv);
});

router.get("/anthropic/conversations/:id", async (req, res): Promise<void> => {
  const params = GetAnthropicConversationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [conv] = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.id, params.data.id));
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  const messages = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, params.data.id))
    .orderBy(messagesTable.createdAt);
  res.json({ ...conv, messages });
});

router.delete("/anthropic/conversations/:id", async (req, res): Promise<void> => {
  const params = DeleteAnthropicConversationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [conv] = await db
    .delete(conversationsTable)
    .where(eq(conversationsTable.id, params.data.id))
    .returning();
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  res.sendStatus(204);
});

router.get("/anthropic/conversations/:id/messages", async (req, res): Promise<void> => {
  const params = ListAnthropicMessagesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const messages = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, params.data.id))
    .orderBy(messagesTable.createdAt);
  res.json(messages);
});

router.post("/anthropic/conversations/:id/messages", async (req, res): Promise<void> => {
  const params = SendAnthropicMessageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = SendAnthropicMessageBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const conversationId = params.data.id;

  // Save user message
  await db.insert(messagesTable).values({
    conversationId,
    role: "user",
    content: body.data.content,
  });

  // Load conversation history (capped to the most recent messages to limit token cost)
  const history = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, conversationId))
    .orderBy(messagesTable.createdAt);

  const chatMessages = history.slice(-HISTORY_LIMIT).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  let fullResponse = "";

  const stream = await openai.chat.completions.create({
    model: CHAT_MODEL,
    max_completion_tokens: 8192,
    messages: [
      { role: "system", content: buildSystemPrompt() },
      ...chatMessages,
    ],
    stream: true,
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      fullResponse += content;
      res.write(`data: ${JSON.stringify({ content })}\n\n`);
    }
  }

  // Parse [ПОКАЗАТЬ:категория] markers and collect images
  const markerRegex = /\[ПОКАЗАТЬ:([^\]]+)\]/gi;
  const productImages: string[] = [];
  let match;
  while ((match = markerRegex.exec(fullResponse)) !== null) {
    const imgs = getImagesForKeyword(match[1]);
    imgs.forEach((img) => { if (!productImages.includes(img)) productImages.push(img); });
  }
  // Strip markers from saved text
  const cleanedResponse = fullResponse.replace(/\[ПОКАЗАТЬ:[^\]]+\]/gi, "").trim();

  // Save assistant message (without markers)
  await db.insert(messagesTable).values({
    conversationId,
    role: "assistant",
    content: cleanedResponse,
  });

  // Extract contacts from user message and upsert lead
  const userText = body.data.content;
  const phoneMatch = userText.match(/(?:\+7|8)[\s-]?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}/);
  const emailMatch = userText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);

  if (phoneMatch || emailMatch) {
    const existing = await db
      .select()
      .from(leadsTable)
      .where(eq(leadsTable.conversationId, conversationId));

    const nameMatch = userText.match(/меня зовут\s+(\w+)/i) ||
      userText.match(/^(\w+)$/);
    const name = nameMatch ? nameMatch[1] : null;

    const phone = phoneMatch ? phoneMatch[0] : null;
    const email = emailMatch ? emailMatch[0] : null;

    let lead: typeof leadsTable.$inferSelect;
    // Only notify when a NEW contact field appears (avoids repeat alerts).
    let isNewContact = false;

    if (existing.length > 0) {
      const prev = existing[0];
      isNewContact = (!!phone && !prev.phone) || (!!email && !prev.email);
      [lead] = await db
        .update(leadsTable)
        .set({
          phone: phone ?? prev.phone,
          email: email ?? prev.email,
          name: name ?? prev.name,
          stage: "contact",
        })
        .where(eq(leadsTable.conversationId, conversationId))
        .returning();
    } else {
      isNewContact = true;
      [lead] = await db
        .insert(leadsTable)
        .values({
          conversationId,
          phone,
          email,
          name,
          stage: "contact",
        })
        .returning();
    }

    if (isNewContact && lead) {
      // Fire-and-forget: notification network I/O must not delay the SSE close.
      void notifyAdminOfLead({
        source: "Сайт",
        name: lead.name,
        phone: lead.phone,
        email: lead.email,
        preferences: lead.preferences,
        message: userText,
      });
    }
  } else {
    const existing = await db
      .select()
      .from(leadsTable)
      .where(eq(leadsTable.conversationId, conversationId));
    if (existing.length === 0) {
      await db.insert(leadsTable).values({
        conversationId,
        stage: "discovery",
      });
    }
  }

  res.write(`data: ${JSON.stringify({ done: true, images: productImages })}\n\n`);
  res.end();
});

export default router;
