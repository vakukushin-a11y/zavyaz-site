import { Router, type IRouter } from "express";
import { db, leadsTable } from "";
import { eq } from "drizzle-orm";
import { notifyAdminOfLead } from "../../telegram/notify";
import { notifyMaxOwnerOfLead } from "../../max/notify";
const router: IRouter = Router();

const VALID_STATUSES = ["new", "contacted", "order_placed", "closed"] as const;
type AdminStatus = (typeof VALID_STATUSES)[number];

router.post("/leads", async (req, res): Promise<void> => {
  const { name, phone, email, preferences, conversationId } = req.body as {
    name?: string;
    phone?: string;
    email?: string;
    preferences?: string;
    conversationId?: number;
  };
  const [lead] = await db
    .insert(leadsTable)
    .values({
      name: name ?? null,
      phone: phone ?? null,
      email: email ?? null,
      preferences: preferences ?? null,
      conversationId: conversationId ?? null,
      stage: "order_form",
    })
    .returning();

  void notifyAdminOfLead({
    source: "Сайт",
    name: lead.name,
    phone: lead.phone,
    email: lead.email,
    preferences: lead.preferences,
  });

  void notifyMaxOwnerOfLead({
    source: "Сайт",
    name: lead.name,
    phone: lead.phone,
    email: lead.email,
    preferences: lead.preferences,
  });

  res.status(201).json(lead);
});

router.get("/leads", async (_req, res): Promise<void> => {
  const leads = await db
    .select()
    .from(leadsTable)
    .orderBy(leadsTable.createdAt);
  res.json(leads);
});

router.patch("/leads/:id/status", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid lead id" });
    return;
  }

  const { adminStatus } = req.body as { adminStatus?: string };
  if (!adminStatus || !(VALID_STATUSES as readonly string[]).includes(adminStatus)) {
    res.status(400).json({ error: "Invalid status value" });
    return;
  }

  const updated = await db
    .update(leadsTable)
    .set({ adminStatus: adminStatus as AdminStatus })
    .where(eq(leadsTable.id, id))
    .returning();

  if (updated.length === 0) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  res.json(updated[0]);
});

router.get("/leads/stats", async (_req, res): Promise<void> => {
  const allLeads = await db.select().from(leadsTable);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const total = allLeads.length;
  const withPhone = allLeads.filter((l) => l.phone).length;
  const withEmail = allLeads.filter((l) => l.email).length;
  const todayCount = allLeads.filter(
    (l) => new Date(l.createdAt) >= today
  ).length;

  res.json({ total, withPhone, withEmail, todayCount });
});

export default router;
