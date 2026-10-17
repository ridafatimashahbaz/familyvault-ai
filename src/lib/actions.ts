"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";

import { signIn, signOut } from "@/auth";
import { clientIp } from "@/lib/rate-limit";
import { registerSchema, registerUser } from "@/lib/services/users";

/**
 * Server actions for the session lifecycle.
 *
 * Sign-in and sign-out run here rather than from the client so the session
 * cookie is set or cleared in the same response that redirects. `signIn`
 * signals success by throwing a redirect, which is why every catch block below
 * has to let redirect errors through.
 */

export type AuthFormState = {
  message?: string;
  fieldErrors?: Record<string, string[]>;
} | null;

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/login?signedOut=1" });
}

export async function signInAction(_state: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { message: "Enter your email and password." };
  }

  try {
    await signIn("credentials", { email, password, redirectTo: "/dashboard" });
  } catch (error) {
    if (isRedirect(error)) throw error;
    return { message: messageFor(error) ?? "We could not sign you in with those details." };
  }

  // signIn redirects on success; this is only reached if it somehow did not.
  return null;
}

export async function registerAction(
  _state: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword") || undefined,
  });

  if (!parsed.success) {
    return {
      message: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    // Registering and signing in immediately would otherwise be a way to create
    // accounts past the rate limit without ever being throttled.
    await registerUser(parsed.data, await requestIp());
  } catch (error) {
    return { message: messageFor(error) ?? "We could not create your account." };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: "/dashboard",
    });
  } catch (error) {
    if (isRedirect(error)) throw error;
    // The account exists; only the automatic sign-in failed.
    redirect("/login?registered=1");
  }

  return null;
}

/**
 * next-auth wraps whatever `authorize` throws in an AuthError and keeps the
 * original on `cause.err`, which is how "too many attempts" stays distinct from
 * "wrong password" all the way to the form.
 */
function messageFor(error: unknown): string | null {
  const cause = error instanceof AuthError ? (error.cause as { err?: Error } | undefined)?.err : error;

  if (cause instanceof Error) {
    if (cause.message === "RATE_LIMITED") {
      return "Too many sign-in attempts. Wait 15 minutes and try again.";
    }
    if (cause.message === "INVALID_CREDENTIALS") {
      return "That email and password do not match an account.";
    }
    // registerUser throws ApiRequestError with a message meant for the user.
    if (cause.name === "ApiRequestError" || cause.name === "ZodError") return cause.message;
  }

  return null;
}

function isRedirect(error: unknown): boolean {
  const digest = (error as { digest?: string } | null)?.digest;
  return typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK"));
}

async function requestIp(): Promise<string> {
  const headerList = await headers();
  return clientIp(new Request("http://localhost", { headers: headerList }));
}
