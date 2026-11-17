import crypto from 'crypto';
import { Router } from 'express';
import { requireAuth, requirePermission } from '../auth.ts';
import type { AuthenticatedRequest } from '../auth.ts';
import { db, hasUserPermission, pushNotification } from '../db.ts';
import type { SupportTicket } from '../types.ts';

const router = Router();

// List tickets: authorized support admin sees all, student sees strictly own tickets
router.get('/support/tickets', requireAuth, (req: AuthenticatedRequest, res) => {
  const store = db.get();
  const all = store.supportTickets || [];
  const canManageSupport = hasUserPermission(req.currentUser, 'manage_support');
  const statusFilter = req.query.status as string | undefined;

  let tickets = canManageSupport
    ? [...all]
    : all.filter((t) => t.userId === req.currentUser!.id);

  if (statusFilter && ['open', 'in_review', 'resolved'].includes(statusFilter)) {
    tickets = tickets.filter((t) => t.status === statusFilter);
  }

  tickets.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  res.json({ tickets });
});

// Create support/bug ticket
router.post('/support/tickets', requireAuth, (req: AuthenticatedRequest, res) => {
  const { category, subject, description, section } = req.body as {
    category?: SupportTicket['category'];
    subject?: string;
    description?: string;
    section?: string;
  };

  if (!subject?.trim() || subject.trim().length < 3 || subject.trim().length > 120) {
    res.status(400).json({ error: 'عنوان البلاغ يجب أن يكون بين 3 و 120 حرفاً.' });
    return;
  }

  if (
    !description?.trim() ||
    description.trim().length < 10 ||
    description.trim().length > 2000
  ) {
    res.status(400).json({ error: 'تفاصيل المشكلة يجب أن تكون بين 10 و 2000 حرف.' });
    return;
  }

  const validCategory: SupportTicket['category'] =
    category && ['bug', 'course', 'account', 'suggestion'].includes(category)
      ? category
      : 'bug';

  const now = new Date().toISOString();
  const ticket: SupportTicket = {
    id: `ticket-${crypto.randomUUID()}`,
    userId: req.currentUser!.id,
    userName: req.currentUser!.name,
    userEmail: req.currentUser!.email || '',
    userYear: req.currentUser!.year,
    category: validCategory,
    subject: subject.trim(),
    description: description.trim(),
    section: section?.trim().slice(0, 60) || undefined,
    status: 'open',
    createdAt: now,
    updatedAt: now,
  };

  const store = db.get();
  if (!Array.isArray(store.supportTickets)) {
    store.supportTickets = [];
  }
  store.supportTickets.unshift(ticket);
  if (store.supportTickets.length > 300) {
    store.supportTickets = store.supportTickets.slice(0, 300);
  }
  db.save();

  pushNotification({
    title: 'بلاغ دعم فني جديد',
    message: `${req.currentUser!.name}: ${ticket.subject}`,
    type: 'general',
    targetSection: 'community',
    year: 0,
    createdBy: req.currentUser!.name,
  });

  res.status(201).json({ ticket });
});

// Admin triage / reply on ticket
router.patch(
  '/admin/support/tickets/:id',
  requireAuth,
  requirePermission('manage_support'),
  (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const { status, adminReply } = req.body as {
      status?: SupportTicket['status'];
      adminReply?: string;
    };

    const store = db.get();
    const ticket = (store.supportTickets || []).find((t) => t.id === id);
    if (!ticket) {
      res.status(404).json({ error: 'التذكرة غير موجودة.' });
      return;
    }

    if (status && ['open', 'in_review', 'resolved'].includes(status)) {
      ticket.status = status;
    }

    if (adminReply !== undefined) {
      const cleanReply = adminReply.trim().slice(0, 2000);
      ticket.adminReply = cleanReply || undefined;
      ticket.repliedBy = req.currentUser!.name;
      ticket.repliedAt = new Date().toISOString();
    }

    ticket.updatedAt = new Date().toISOString();
    db.save();

    res.json({ ticket });
  }
);

export default router;
