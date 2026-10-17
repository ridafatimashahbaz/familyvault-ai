import bcrypt from "bcryptjs";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { ApiRequestError } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";

export const BCRYPT_ROUNDS = 12;

export const registerSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Name must be at least 2 characters")
      .max(80, "Name must be at most 80 characters"),
    email: z.email("Enter a valid email address").max(254),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(200, "Password must be at most 200 characters")
      .regex(/[A-Za-z]/, "Password must contain a letter")
      .regex(/\d/, "Password must contain a number"),
    confirmPassword: z.string().optional(),
  })
  .refine((d) => !d.confirmPassword || d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type RegisterInput = z.infer<typeof registerSchema>;

export type PublicUser = { id: string; email: string; name: string };

export async function registerUser(
  input: RegisterInput,
  ip = "unknown",
): Promise<PublicUser> {
  const limited = rateLimit(`register:${ip}`, 5, 60 * 60 * 1000);
  if (!limited.ok) {
    throw new ApiRequestError(
      429,
      "Too many accounts created from this network. Try again later.",
    );
  }

  const email = input.email.toLowerCase().trim();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new ApiRequestError(409, "An account with this email already exists");
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  try {
    const user = await prisma.user.create({
      data: { email, passwordHash, name: input.name.trim() },
      select: { id: true, email: true, name: true },
    });
    return user;
  } catch (error) {
    // Unique constraint - a concurrent request won the race.
    if (
      typeof error === "object" &&
      error !== null &&
      (error as { code?: string }).code === "P2002"
    ) {
      throw new ApiRequestError(409, "An account with this email already exists");
    }
    throw error;
  }
}

export type Profile = PublicUser & { createdAt: Date };

export async function getProfile(userId: string): Promise<Profile> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, createdAt: true },
  });

  if (!user) throw new ApiRequestError(404, "Account not found");
  return user;
}

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password"),
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(200)
    .regex(/[A-Za-z]/, "Password must contain a letter")
    .regex(/\d/, "Password must contain a number"),
});

export async function changePassword(
  userId: string,
  input: z.infer<typeof changePasswordSchema>,
): Promise<void> {
  // Verifying the current password is a guessing oracle for anyone holding a
  // session cookie, so it gets its own budget.
  const limited = rateLimit(`password:${userId}`, 5, 15 * 60_000);
  if (!limited.ok) {
    throw new ApiRequestError(429, "Too many password attempts. Try again in 15 minutes.");
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiRequestError(404, "Account not found");

  const matches = await bcrypt.compare(input.currentPassword, user.passwordHash);
  if (!matches) {
    throw new ApiRequestError(403, "Your current password is incorrect");
  }

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await bcrypt.hash(input.newPassword, BCRYPT_ROUNDS) },
  });
}

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(80),
});

export async function updateProfile(
  userId: string,
  input: z.infer<typeof updateProfileSchema>,
): Promise<PublicUser> {
  return prisma.user.update({
    where: { id: userId },
    data: { name: input.name.trim() },
    select: { id: true, email: true, name: true },
  });
}
