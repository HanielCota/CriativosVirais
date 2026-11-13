import type { Metadata } from "next";
import { z } from "zod";
import { AuthForm } from "@/components/auth-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { staffRoleLabel } from "@/lib/staff";
import { teamInviteTokenSchema } from "@/lib/team-invite-token";
import { teamInviteRole } from "@/lib/team-invites";

export const metadata: Metadata = { title: "Prisciane Pereira" };

const invitedEmail = z.email().max(254);

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { senha, email, invite } = await searchParams;
  const inviteToken = teamInviteTokenSchema.safeParse(invite).data;
  const inviteEmail = invitedEmail.safeParse(email).data;
  if (inviteToken != null && inviteEmail != null) return <TeamInviteLogin email={inviteEmail} token={inviteToken} />;
  if (senha !== "alterada") return <AuthForm mode="login" />;
  return (
    <div className="space-y-6">
      <Alert role="status">
        <AlertDescription>Senha alterada. Entre com a nova senha.</AlertDescription>
      </Alert>
      <AuthForm mode="login" />
    </div>
  );
}

/** Someone with an account opened a team invite: signing in with this link accepts it. */
async function TeamInviteLogin({ email, token }: { email: string; token: string }) {
  const role = await teamInviteRole(email, token);
  return (
    <div className="space-y-6">
      <Alert role="status">
        <AlertDescription>
          {role == null
            ? "Este convite venceu ou já foi usado. Peça um novo convite a quem chamou você para a equipe."
            : `Você recebeu um convite para a equipe do Criativos Virais como ${staffRoleLabel[role]}. Entre com a sua conta para aceitar.`}
        </AlertDescription>
      </Alert>
      <AuthForm mode="login" defaultEmail={email} inviteToken={role == null ? undefined : token} />
    </div>
  );
}
