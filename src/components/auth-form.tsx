"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { LoaderCircle } from "@/components/icons";
import { authClient } from "@/lib/auth-client";
import { minPasswordLength, newPasswordSchema } from "@/lib/password-rules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { TwoFactorStep } from "@/components/two-factor-step";
import { teamInviteTokenHeader } from "@/lib/team-invite-token";

const loginSchema = z.object({
  email: z.email({ error: "Informe um email válido." }),
  password: z
    .string()
    .min(1, { error: "Informe sua senha." })
    .max(128, { error: "Use no máximo 128 caracteres." }),
});
const signupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { error: "Informe seu nome." })
    .max(100, { error: "Use no máximo 100 caracteres." }),
  email: loginSchema.shape.email,
  password: newPasswordSchema,
});

type Field = "name" | "email" | "password";
type AuthResult = { data?: unknown; error?: { code?: string; message?: string } | null };
// Server refusals that already carry the plain pt-BR reason the person must read.
const explainedRefusals = new Set(["NO_ACCESS_GRANT", "BANNED_USER", "INVALID_TEAM_INVITE"]);

function refusalMessage(error: { code?: string; message?: string }, signup: boolean) {
  if (error.code !== undefined && explainedRefusals.has(error.code) && error.message !== undefined)
    return error.message;
  // Also the path back for a buyer whose email someone else signed up with: the reset link reaches only her.
  if (signup)
    return 'Não foi possível criar a conta. Se este e-mail já tem cadastro, entre com ele ou use "Esqueceu a senha?" na tela de entrar.';
  return "E-mail ou senha incorretos.";
}

function needsTwoFactor(data: unknown) {
  return typeof data === "object" && data !== null && "twoFactorRedirect" in data && data.twoFactorRedirect === true;
}
type FieldErrors = Partial<Record<Field, string>>;

const acceptedSchema = z.object({ joined: z.boolean() });

/** Signing in through a team invite link accepts the invite; a new team member lands on the panel. */
async function pageAfterSignIn(inviteToken: string | undefined) {
  if (inviteToken == null) return "/chat";
  const response = await fetch("/api/team-invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: inviteToken }),
  });
  const accepted = acceptedSchema.safeParse(await response.json().catch(() => null)).data;
  return accepted?.joined === true ? "/admin" : "/chat";
}

function toFieldErrors(error: z.ZodError) {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (field === "name" || field === "email" || field === "password")
      errors[field] ??= issue.message;
  }
  return errors;
}

/** defaultEmail comes from the invite link, so the invited person only picks a name and a password. */
export function AuthForm({ mode, defaultEmail, inviteToken }: { mode: "login" | "signup"; defaultEmail?: string; inviteToken?: string }) {
  const signup = mode === "signup";
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [twoFactor, setTwoFactor] = useState(false);

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = Object.fromEntries(new FormData(form));
    setFormError(null);
    function invalid(error: z.ZodError) {
      const errors = toFieldErrors(error);
      setFieldErrors(errors);
      const first = (["name", "email", "password"] as const).find(
        (field) => errors[field],
      );
      const input = first && form.elements.namedItem(first);
      if (input instanceof HTMLInputElement) input.focus();
    }
    if (signup) {
      const parsed = signupSchema.safeParse(fields);
      if (!parsed.success) return invalid(parsed.error);
      const { name, email, password } = parsed.data;
      const fetchOptions = { headers: inviteToken ? { [teamInviteTokenHeader]: inviteToken } : {} };
      await run(() => authClient.signUp.email({ name, email, password, fetchOptions }));
    } else {
      const parsed = loginSchema.safeParse(fields);
      if (!parsed.success) return invalid(parsed.error);
      await run(() => authClient.signIn.email(parsed.data));
    }
  }

  async function run(call: () => Promise<AuthResult>) {
    setFieldErrors({});
    setPending(true);
    try {
      const result = await call();
      if (result.error) {
        setFormError(refusalMessage(result.error, signup));
        return;
      }
      // Admin accounts confirm with the authenticator code before the session starts.
      if (needsTwoFactor(result.data)) {
        setTwoFactor(true);
        return;
      }
      router.replace(signup ? "/chat" : await pageAfterSignIn(inviteToken));
      router.refresh();
    } catch {
      setFormError(
        "Não foi possível conectar. Verifique sua internet e tente novamente.",
      );
    } finally {
      setPending(false);
    }
  }

  function describedBy(field: Field, hint?: string) {
    return (
      [hint, fieldErrors[field] ? `${field}-error` : undefined]
        .filter(Boolean)
        .join(" ") || undefined
    );
  }

  function fieldError(field: Field) {
    return fieldErrors[field] ? (
      <p id={`${field}-error`} className="text-sm text-destructive">
        {fieldErrors[field]}
      </p>
    ) : null;
  }

  if (twoFactor) return <TwoFactorStep nextPage={() => pageAfterSignIn(inviteToken)} />;

  return (
    <div className="space-y-8">
      <header className="space-y-1.5">
        <h1 className="page-title">
          {signup ? "Crie sua conta" : "Entre na sua conta"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {signup
            ? "Leva um minuto. Use o mesmo e-mail da sua compra."
            : "Acesse seus criativos e roteiros."}
        </p>
      </header>
      <form
        onSubmit={submit}
        aria-busy={pending}
        noValidate
        className="space-y-4"
      >
        {signup && (
          <div className="space-y-2">
            <Label htmlFor="name">Nome</Label>
            <Input
              className="min-h-11"
              id="name"
              name="name"
              required
              maxLength={100}
              autoComplete="name"
              disabled={pending}
              aria-describedby={describedBy("name")}
              aria-invalid={fieldErrors.name ? true : undefined}
            />
            {fieldError("name")}
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input
            className="min-h-11"
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="next"
            placeholder="voce@exemplo.com"
            defaultValue={defaultEmail}
            disabled={pending}
            aria-describedby={describedBy("email")}
            aria-invalid={fieldErrors.email ? true : undefined}
          />
          {fieldError("email")}
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Senha</Label>
          <PasswordInput
            className="min-h-11"
            id="password"
            name="password"
            required
            maxLength={128}
            autoComplete={signup ? "new-password" : "current-password"}
            enterKeyHint={signup ? "done" : "go"}
            disabled={pending}
            aria-describedby={describedBy(
              "password",
              signup ? "password-hint" : undefined,
            )}
            aria-invalid={fieldErrors.password ? true : undefined}
          />
          {signup && (
            <p id="password-hint" className="text-xs text-muted-foreground">
              Pelo menos {minPasswordLength} caracteres.
            </p>
          )}
          {fieldError("password")}
          {!signup && (
            <div className="flex justify-end">
              <Link
                href="/recuperar-senha"
                className="rounded-sm text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground pointer-coarse:py-2"
              >
                Esqueceu a senha?
              </Link>
            </div>
          )}
        </div>
        {formError && (
          <Alert variant="destructive">
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}
        <Button className="mt-2 w-full" size="lg" type="submit" disabled={pending}>
          {pending && (
            <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />
          )}
          {pending
            ? signup
              ? "Criando conta…"
              : "Entrando…"
            : signup
              ? "Criar conta"
              : "Entrar"}
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        {signup ? "Já tem uma conta?" : "Ainda não tem uma conta?"}{" "}
        <Link
          className="rounded-sm font-medium text-foreground underline underline-offset-4 hover:decoration-2 pointer-coarse:py-2"
          href={signup ? "/login" : "/signup"}
        >
          {signup ? "Entrar" : "Criar conta"}
        </Link>
      </p>
    </div>
  );
}
