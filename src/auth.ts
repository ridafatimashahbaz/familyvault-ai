import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const credentialsSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(200),
});

/** Accepts "30m", "24h", "7d"; falls back to 7 days. */
function parseMaxAgeSeconds(value: string): number {
  const match = /^(\d+)\s*([smhd])$/i.exec(value.trim());
  if (!match) return 7 * 24 * 60 * 60;

  const amount = Number.parseInt(match[1]!, 10);
  const unit = match[2]!.toLowerCase();
  const perUnit = { s: 1, m: 60, h: 3600, d: 86400 }[unit] ?? 86400;
  return amount * perUnit;
}

export const sessionMaxAge = parseMaxAgeSeconds(env().AUTH_SESSION_MAX_AGE);

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: env().AUTH_SECRET,
  trustHost: true,
  session: { strategy: "jwt", maxAge: sessionMaxAge },
  pages: { signIn: "/login", error: "/login" },

  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.email = user.email;
        token.name = user.name;
      }
      return token;
    },
    session({ session, token }) {
      if (token.uid) session.user.id = token.uid as string;
      if (token.email) session.user.email = token.email as string;
      if (token.name) session.user.name = token.name as string;
      return session;
    },
  },

  providers: [
    Credentials({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw, request) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const ip = request ? clientIp(request) : "unknown";

        // Two independent windows: per-IP to stop credential stuffing across
        // accounts, and per-account to stop targeted guessing.
        const byIp = rateLimit(`login:ip:${ip}`, 20, 15 * 60 * 1000);
        const byEmail = rateLimit(`login:email:${email.toLowerCase()}`, 8, 15 * 60 * 1000);
        if (!byIp.ok || !byEmail.ok) {
          throw new Error("RATE_LIMITED");
        }

        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase() },
        });

        // Always run a hash comparison so a missing account and a wrong
        // password take the same amount of time.
        const hash =
          user?.passwordHash ??
          "$2a$12$C6UzMDM.H6dfI/f/IKcEeO7ZBpDLlV6bXt7aG9Yw3pQ8mJ5nK4uOe";
        const valid = await bcrypt.compare(password, hash);

        if (!user || !valid) {
          throw new Error("INVALID_CREDENTIALS");
        }

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
});
