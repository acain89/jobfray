import { z } from "zod";
import { isValidZip } from "@/lib/zip-radius";

export const needByValues = [
  "ASAP",
  "TODAY",
  "TOMORROW",
  "THIS_WEEK",
  "FLEXIBLE",
] as const;

const zipSchema = z
  .string()
  .trim()
  .regex(/^\d{5}$/, "Enter a valid 5-digit ZIP code.")
  .refine((zip) => isValidZip(zip), {
    message: "Enter a supported ZIP code.",
  });

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

const photoUrlsSchema = z
  .array(z.string().url())
  .min(1, "At least 1 photo is required.")
  .max(3, "Maximum 3 photos allowed.");

export const createPostSchema = z.object({
  zip: zipSchema,
  categoryId: z.string().trim().min(1, "Choose a category."),
  title: z.string().trim().min(6).max(80),
  description: z.string().trim().min(20).max(1000),
  exactAddress: z.string().trim().min(5).max(200),
  phone: phoneSchema,
  needBy: z.enum(needByValues),
  payAmountCents: z.number().int().min(100).max(500000),
  photoUrls: photoUrlsSchema,
});

export const createFreeStuffPostSchema = z.object({
  zip: zipSchema,
  title: z.string().trim().min(6).max(80),
  description: z.string().trim().min(20).max(1000),
  phone: phoneSchema,
  photoUrls: photoUrlsSchema,
});

export const verifyPostSchema = z.object({
  postId: z.string().trim().min(1),
  phone: phoneSchema,
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code."),
});

export type CreatePostInput = z.infer<typeof createPostSchema>;
export type CreateFreeStuffPostInput = z.infer<typeof createFreeStuffPostSchema>;
export type VerifyPostInput = z.infer<typeof verifyPostSchema>;