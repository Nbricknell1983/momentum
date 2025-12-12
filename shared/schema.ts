import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, real, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const stageEnum = pgEnum('stage', [
  'suspect',
  'contacted',
  'engaged',
  'qualified',
  'discovery',
  'proposal',
  'verbal_commit',
  'won',
  'lost',
  'nurture'
]);

export const nurtureModeEnum = pgEnum('nurture_mode', ['none', 'active', 'passive']);

export const nurtureStatusEnum = pgEnum('nurture_status', [
  'new',
  'touched_waiting',
  'needs_touch',
  'reengaged',
  'dormant',
  'exit'
]);

export const touchChannelEnum = pgEnum('touch_channel', ['call', 'sms', 'email']);

export const leads = pgTable("leads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  companyName: text("company_name").notNull(),
  territory: text("territory").default(''),
  address: text("address"),
  phone: text("phone"),
  email: text("email"),
  website: text("website"),
  stage: stageEnum("stage").notNull().default('suspect'),
  mrr: real("mrr"),
  nepqLabel: text("nepq_label"),
  nextContactDate: timestamp("next_contact_date"),
  lastContactDate: timestamp("last_contact_date"),
  lastActivityAt: timestamp("last_activity_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  archived: boolean("archived").notNull().default(false),
  contactName: text("contact_name"),
  notes: text("notes"),
  crmLink: text("crm_link"),
  nurtureMode: nurtureModeEnum("nurture_mode").notNull().default('none'),
  nurtureCadenceId: varchar("nurture_cadence_id"),
  nurtureStatus: nurtureStatusEnum("nurture_status"),
  nurtureStepIndex: integer("nurture_step_index"),
  enrolledInNurtureAt: timestamp("enrolled_in_nurture_at"),
  nextTouchAt: timestamp("next_touch_at"),
  lastTouchAt: timestamp("last_touch_at"),
  lastTouchChannel: touchChannelEnum("last_touch_channel"),
  touchesNoResponse: integer("touches_no_response").notNull().default(0),
  engagementScore: integer("engagement_score").notNull().default(0),
  nurturePriorityScore: integer("nurture_priority_score").notNull().default(0),
});

export const insertLeadSchema = createInsertSchema(leads).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leads.$inferSelect;

export const activities = pgTable("activities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  leadId: varchar("lead_id").notNull(),
  type: text("type").notNull(),
  notes: text("notes"),
  outcome: text("outcome"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  nextContactDate: timestamp("next_contact_date"),
});

export const insertActivitySchema = createInsertSchema(activities).omit({
  id: true,
  createdAt: true,
});

export type InsertActivity = z.infer<typeof insertActivitySchema>;
export type Activity = typeof activities.$inferSelect;
