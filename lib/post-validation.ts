import { z } from "zod";

export const needByValues = [
  "ASAP",
  "TODAY",
  "TOMORROW",
  "THIS_WEEK",
  "FLEXIBLE",
] as const;

const phoneSchema = z
  .string()
  .trim()
  .min(10)
  .max(20)
  .transform((value) => value.replace(/\D/g, ""))
  .refine((value) => value.length === 10 || value.length === 11, {
    message: "Enter a valid phone number.",
  })
  .transform((value) => (value.length === 10 ? `1${value}` : value));

export const createPostSchema = z.object({
  zip: z.string().trim().regex(/^\d{5}$/, "Enter a valid 5-digit ZIP code."),
  categoryId: z.string().trim().min(1, "Choose a category."),
  title: z.string().trim().min(6).max(80),
  description: z.string().trim().min(20).max(1000),
  exactAddress: z.string().trim().min(5).max(200),
  phone: phoneSchema,
  needBy: z.enum(needByValues),
  payAmountCents: z.number().int().min(100).max(500000),
  photoUrls: z.array(z.string().url()).max(3).optional().default([]),
});

export const verifyPostSchema = z.object({
  postId: z.string().trim().min(1),
  phone: phoneSchema,
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code."),
});

export type CreatePostInput = z.infer<typeof createPostSchema>;
export type VerifyPostInput = z.infer<typeof verifyPostSchema>;