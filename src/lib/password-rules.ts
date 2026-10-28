import { z } from "zod";

// Shared by Better Auth, sign-up and password reset, so the screens and the server enforce the same rule.
// Four is the client's choice for the free test with students (decided on 28/10/2026).
export const minPasswordLength = 4;
export const maxPasswordLength = 128;

export const newPasswordSchema = z
  .string()
  .min(minPasswordLength, { error: `A senha precisa ter pelo menos ${minPasswordLength} caracteres.` })
  .max(maxPasswordLength, { error: `Use no máximo ${maxPasswordLength} caracteres.` });

// An emailed reset link works once, for this long; the label is what the email and screens say.
export const resetLinkLifetimeSeconds = 60 * 60;
export const resetLinkLifetimeLabel = "1 hora";
