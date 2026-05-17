import { z } from "zod";

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

export const workerSignupSchema = z.object({
  firstName: z.string().trim().min(2).max(40),
  lastInitial: z.string().trim().max(1).optional().default(""),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(24)
    .regex(/^[a-z0-9_]+$/, "Use letters, numbers, and underscores only."),
  phone: phoneSchema,
  homeZip: z.string().trim().regex(/^\d{5}$/, "Enter a valid 5-digit ZIP code."),
  password: z.string().min(8).max(100),
});

export const workerLoginSchema = z.object({
  username: z.string().trim().toLowerCase().min(3).max(24),
  password: z.string().min(8).max(100),
});

export type WorkerSignupInput = z.infer<typeof workerSignupSchema>;
export type WorkerLoginInput = z.infer<typeof workerLoginSchema>;