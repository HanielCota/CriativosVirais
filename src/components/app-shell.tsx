"use client";
import Link from "next/link";
import { usePathname, useRouter, useSelectedLayoutSegment } from "next/navigation";
import {
  Archive,
  ChartColumn,
  History,
  Layers,
  LogOut,
  Plug,
  Search,
  Settings,
  ShieldCheck,
  SquarePen,
  UserRound,
  X,
  type LucideIcon,
} from "@/components/icons";
import { toast } from "sonner";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Brand } from "@/components/brand";
import { StrategistAvatar } from "@/components/chat/strategist";
import { Hint } from "@/components/hint";
import { ThemeMenuGroup } from "@/components/theme-toggle";
import { ConversationActions } from "@/components/conversation-actions";
import { usePanelReload } from "@/components/panel-reload";
import { authClient } from "@/lib/auth-client";
import { api, toastError } from "@/lib/client";
import { spDay } from "@/lib/dates";
import { cn } from "@/lib/utils";

type NavLink = { href: string; label: string; icon: LucideIcon };

/** Places that open as panels over the conversation. */
const places: NavLink[] = [
  { href: "/levas", label: "Levas", icon: Layers },
  { href: "/criativos", label: "Resultados", icon: ChartColumn },
];
/** Account menu entries, also opened as panels. */
const account: NavLink[] = [
  { href: "/configuracoes", label: "Minha oferta", icon: Settings },
  { href: "/integracoes", label: "Integrações", icon: Plug },
  { href: "/perfil", label: "Perfil", icon: UserRound },
];
const archivedHref = "/conversas/arquivadas";

type User = { name: string; email?: string; image?: string };
type Conversation = { id: string; title: string; createdAt: Date };

const quietButton =
  "text-muted-foreground hover:bg-accent hover:text-foreground";
/** Top bar items name what they do: the word sits under the icon on phones and beside it on wider screens. */
const barItem =
  "h-11 min-w-11 shrink-0 flex-col gap-0.5 px-1 py-0.5 text-[11px] leading-none sm:h-9 sm:min-w-0 sm:flex-row sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-sm sm:leading-normal sm:pointer-coarse:h-11";

/** Rows sit inside clipped scroll areas, so their focus outline is inset. */
const rowFocus =
  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring";

/** One row shape for every history link: flat until hovered or current. */
const rowBase =
  "group flex h-10 items-center gap-3 rounded-lg px-2.5 text-[0.9375rem] transition-colors duration-(--duration-fast) pointer-coarse:h-11";
const rowIdle = "text-foreground/80 hover:bg-accent hover:text-foreground";
const rowCurrent = "bg-accent font-medium text-foreground";

/** Fine pointer (mouse/trackpad) only: touch keyboards should not open by themselves. */
function canAutofocus() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(pointer: fine)").matches
  );
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * App frame: one conversation surface (the hero) under a minimal top bar.
 * Levas, results, offer, integrations and profile open as panels over it;
 * history opens from the top bar or with Ctrl/⌘ + K. Chat routes get an
 * unpadded flex column; direct visits to other pages get a padded column.
 */
export function AppShell({
  children,
  panel,
  user,
  conversations,
  banner,
  showAdminLink,
}: {
  children: React.ReactNode;
  panel: React.ReactNode;
  user: User;
  conversations: Conversation[];
  /** Notice above the header, such as the support visit. */
  banner?: React.ReactNode;
  /** Team members outside a support visit get a shortcut to the panel. */
  showAdminLink: boolean;
}) {
  const pathname = usePathname();
  const [historyOpen, setHistoryOpen] = useState(false);
  const chat = useChatBehindPanel(isActive(pathname, "/chat"));
  const conversationId = /^\/chat\/([^/]+)/.exec(pathname)?.[1];
  const title = conversations.find((c) => c.id === conversationId)?.title;
  usePanelReload(conversationId);

  useEffect(() => {
    // Ctrl/⌘ + K opens the conversation history from anywhere.
    function onKey(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "k" || !(event.ctrlKey || event.metaKey))
        return;
      event.preventDefault();
      setHistoryOpen(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      data-slot="app-shell"
      data-chat={chat ? "" : undefined}
      className={cn(
        "flex flex-col bg-background print:block print:h-auto print:overflow-visible",
        chat ? "h-dvh overflow-hidden" : "min-h-svh",
      )}
    >
      {banner}
      <header
        data-print="hide"
        className="sticky top-0 z-30 flex h-[calc(3.5rem+env(safe-area-inset-top))] shrink-0 items-center gap-0.5 bg-background/85 px-2 pt-[env(safe-area-inset-top)] backdrop-blur-md sm:gap-1 sm:px-4"
      >
        <Link
          href="/chat"
          aria-label="Criativos Virais — nova conversa"
          className="mr-2 inline-flex h-9 shrink-0 items-center rounded-md px-1"
        >
          {/* Phones show the brand symbol so the shortcuts fit beside it. */}
          <span className="hidden sm:inline-flex">
            <Brand className="h-5" />
          </span>
          <StrategistAvatar className="size-7 sm:hidden" />
        </Link>
        <p className="invisible min-w-0 flex-1 truncate text-sm text-muted-foreground sm:visible">
          {chat && title ? title : ""}
        </p>
        {showAdminLink && <AdminShortcut />}
        <PlaceShortcuts />
        <NewConversationButton labelled />
        <Hint label="Histórico (Ctrl K)">
          <Button
            variant="ghost"
            aria-label="Abrir histórico de conversas"
            className={cn(quietButton, barItem)}
            onClick={() => setHistoryOpen(true)}
          >
            <History aria-hidden className="size-5" />
            Histórico
          </Button>
        </Hint>
        <UserMenu user={user} supportVisit={Boolean(banner)} />
      </header>

      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent
          side="left"
          showCloseButton={false}
          className="w-[min(22rem,92vw)] gap-0 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] data-[side=left]:sm:max-w-[22rem]"
        >
          <SheetTitle className="sr-only">Histórico</SheetTitle>
          <HistoryBody
            conversations={conversations}
            onNavigate={() => setHistoryOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col print:block print:overflow-visible",
          !chat && "overflow-y-auto",
        )}
      >
        <main
          id="main-content"
          tabIndex={-1}
          className={cn(
            "w-full min-w-0 outline-none",
            chat
              ? "flex min-h-0 flex-1 flex-col"
              : "mx-auto max-w-(--content-width) px-4 pt-4 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-8",
          )}
        >
          {children}
        </main>
      </div>
      {panel}
    </div>
  );
}

/**
 * A panel changes the address (/levas, /criativos…) while the conversation stays behind it,
 * so the page keeps the layout it had before the panel opened instead of following the address.
 */
function useChatBehindPanel(onChatRoute: boolean) {
  const panelSegment = useSelectedLayoutSegment("panel");
  const panelOpen = panelSegment?.startsWith("(.)") === true;
  const [chatBehind, setChatBehind] = useState(onChatRoute);
  if (!panelOpen && chatBehind !== onChatRoute) setChatBehind(onChatRoute);
  if (panelOpen) return chatBehind;
  return onChatRoute;
}

/** History drawer: shortcuts to the panels, search and past conversations. */
function HistoryBody({
  conversations,
  onNavigate,
}: {
  conversations: Conversation[];
  onNavigate: () => void;
}) {
  const pathname = usePathname();
  return (
    <div className="flex h-full w-full min-w-0 flex-col">
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 pr-2 pl-5">
        <p className="text-sm font-semibold">Histórico</p>
        <SheetClose
          render={
            <Button
              variant="ghost"
              size="icon"
              aria-label="Fechar histórico"
              className={quietButton}
            />
          }
        >
          <X aria-hidden className="size-5" />
        </SheetClose>
      </div>
      <nav aria-label="Atalhos" className="shrink-0 px-3">
        <ul className="space-y-px">
          {places.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(rowBase, rowFocus, active ? rowCurrent : rowIdle)}
                >
                  <Icon
                    aria-hidden
                    weight={active ? "fill" : "duotone"}
                    className="size-5 shrink-0 text-muted-foreground group-hover:text-foreground"
                  />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <ConversationHistory conversations={conversations} onNavigate={onNavigate} />
    </div>
  );
}

/** The team panel, first in the bar and styled like the place shortcuts. */
function AdminShortcut() {
  return (
    <Link
      href="/admin"
      className={cn(
        buttonVariants({ variant: "ghost" }),
        quietButton,
        barItem,
      )}
    >
      <ShieldCheck aria-hidden className="size-5" />
      <span className="sm:hidden">Admin</span>
      <span className="hidden sm:inline">Painel Admin</span>
    </Link>
  );
}

/** Levas and Resultados one click away, always with their names. */
function PlaceShortcuts() {
  const pathname = usePathname();
  return (
    <nav aria-label="Levas e resultados" className="flex shrink-0 items-center gap-1 sm:mr-1">
      {places.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              buttonVariants({ variant: "ghost" }),
              quietButton,
              barItem,
              active && "bg-accent text-foreground",
            )}
          >
            <Icon aria-hidden weight={active ? "fill" : "duotone"} className="size-5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function useNewConversation(onNavigate?: () => void) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const creating = useRef(false);
  async function create() {
    if (creating.current) return;
    creating.current = true;
    setPending(true);
    try {
      const c = await api("/api/conversations", z.object({ id: z.uuid() }), {});
      onNavigate?.();
      router.push(`/chat/${c.id}`);
      router.refresh();
    } catch (e) {
      toastError(e, "Não foi possível criar a conversa.");
    } finally {
      creating.current = false;
      setPending(false);
    }
  }
  return { create, pending };
}

function NewConversationButton({
  hintSide = "bottom",
  onNavigate,
  className,
  labelled = false,
}: {
  hintSide?: "bottom" | "right";
  onNavigate?: () => void;
  className?: string;
  /** Shows the name beside the icon, as in the top bar. */
  labelled?: boolean;
}) {
  const { create, pending } = useNewConversation(onNavigate);
  return (
    <Hint label="Nova conversa" side={hintSide} disabled={labelled}>
      <Button
        variant="ghost"
        size={labelled ? "default" : "icon"}
        onClick={create}
        disabled={pending}
        aria-busy={pending}
        aria-label={pending ? "Criando conversa" : "Nova conversa"}
        className={cn(quietButton, labelled && barItem, className)}
      >
        <SquarePen aria-hidden className="size-5" />
        {labelled ? (
          <>
            <span className="sm:hidden">Nova</span>
            <span className="hidden sm:inline">Nova conversa</span>
          </>
        ) : null}
      </Button>
    </Hint>
  );
}

const dayMs = 86_400_000;
const buckets = [
  { label: "Hoje", maxDays: 0 },
  { label: "Ontem", maxDays: 1 },
  { label: "Últimos 7 dias", maxDays: 7 },
  { label: "Últimos 30 dias", maxDays: 30 },
  { label: "Mais antigas", maxDays: Infinity },
];

/** Whole calendar days since `date`, counted in São Paulo. */
function daysAgo(date: Date, today: string) {
  return Math.round((Date.parse(today) - Date.parse(spDay(date))) / dayMs);
}

/** Case- and accent-insensitive matching for the search field. */
function fold(text: string) {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function groupByDay(conversations: Conversation[], today: string) {
  const groups = buckets.map((bucket) => ({
    label: bucket.label,
    items: [] as Conversation[],
  }));
  for (const item of conversations) {
    const days = daysAgo(new Date(item.createdAt), today);
    const index = buckets.findIndex(({ maxDays }) => days <= maxDays);
    groups[index].items.push(item);
  }
  return groups.filter((group) => group.items.length);
}

function ConversationHistory({
  conversations,
  onNavigate,
}: {
  conversations: Conversation[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const id = useId();
  const [query, setQuery] = useState("");
  const [today] = useState(() => spDay());
  const groups = useMemo(() => {
    const term = fold(query.trim());
    const matches = term
      ? conversations.filter((c) => fold(c.title).includes(term))
      : conversations;
    return groupByDay(matches, today);
  }, [conversations, query, today]);

  const archivedLink = (
    <Link
      href={archivedHref}
      onClick={onNavigate}
      aria-current={pathname === archivedHref ? "page" : undefined}
      className={cn(
        rowBase,
        rowFocus,
        "mt-3 shrink-0 text-muted-foreground",
        pathname === archivedHref ? rowCurrent : rowIdle,
      )}
    >
      <Archive aria-hidden className="size-5" />
      Arquivadas
    </Link>
  );

  const newConversation = (
    <NewConversationButton
      onNavigate={onNavigate}
      className="size-10 shrink-0 rounded-lg border border-border pointer-coarse:size-11"
    />
  );

  if (!conversations.length) {
    return (
      <div className="mt-4 min-h-0 flex-1 px-3">
        <div className="flex items-center justify-between gap-2 pl-2.5">
          <p className="text-sm text-muted-foreground">
            Suas conversas aparecem aqui.
          </p>
          {newConversation}
        </div>
        {archivedLink}
      </div>
    );
  }

  return (
    <>
      <div className="mx-3 mt-4 flex shrink-0 items-center gap-1.5">
      <div role="search" className="relative min-w-0 flex-1">
        <label htmlFor={`${id}-search`} className="sr-only">
          Buscar conversas
        </label>
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          id={`${id}-search`}
          // On phones focusing would pop the keyboard over the list.
          autoFocus={canAutofocus()}
          type="search"
          enterKeyHint="search"
          value={query}
          placeholder="Buscar"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            // Esc clears first; with an empty field it reaches the drawer.
            if (event.key === "Escape" && query) {
              event.preventDefault();
              event.stopPropagation();
              setQuery("");
            }
          }}
          className="peer h-10 rounded-lg border-border bg-transparent pr-3 pl-9 text-base shadow-none hover:border-foreground/25 focus-visible:border-ring focus-visible:ring-ring/30 md:text-[0.9375rem] dark:bg-transparent pointer-coarse:h-11 [&::-webkit-search-cancel-button]:hidden"
        />
      </div>
      {newConversation}
      </div>

      <nav
        aria-label="Conversas"
        className="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3"
      >
        {groups.length ? (
          groups.map((group, index) => (
            <section
              key={group.label}
              aria-labelledby={`${id}-group-${index}`}
              className="pt-3"
            >
              <h3
                id={`${id}-group-${index}`}
                className="px-2.5 pb-1 text-[0.8125rem] font-medium text-muted-foreground"
              >
                {group.label}
              </h3>
              <ul className="space-y-px">
                {group.items.map((item) => {
                  const href = `/chat/${item.id}`;
                  const active = pathname === href;
                  return (
                    <li key={item.id} className="group/row relative">
                      <Link
                        href={href}
                        onClick={onNavigate}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          rowBase,
                          rowFocus,
                          "pr-10",
                          active ? rowCurrent : rowIdle,
                        )}
                      >
                        <span className="truncate">{item.title}</span>
                      </Link>
                      <ConversationActions
                        conversation={item}
                        className={cn(
                          "absolute top-1/2 right-1 size-8 -translate-y-1/2 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground aria-expanded:opacity-100 focus-visible:opacity-100 pointer-coarse:size-9 pointer-coarse:opacity-100 group-focus-within/row:opacity-100 group-hover/row:opacity-100",
                          !active && "opacity-0",
                        )}
                      />
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        ) : (
          <p
            role="status"
            className="px-2.5 pt-4 text-sm text-muted-foreground"
          >
            Nenhuma conversa encontrada
          </p>
        )}
        {archivedLink}
      </nav>
    </>
  );
}

const menuLink =
  "flex h-8 items-center gap-2 rounded-md px-2.5 text-sm outline-hidden select-none pointer-coarse:h-10 data-highlighted:bg-accent data-highlighted:text-accent-foreground [&_svg]:size-4 [&_svg]:text-muted-foreground";

/** Account menu in the top bar: identity, places, theme and sign out. */
function UserMenu({ user, supportVisit }: { user: User; supportVisit: boolean }) {
  const router = useRouter();
  const initial = user.name.trim().charAt(0).toUpperCase() || "?";

  async function logout() {
    try {
      // Inside a client's account, signing out ends the visit and goes back to the panel.
      if (supportVisit) {
        await api("/api/support-visit", z.object({ left: z.boolean() }), {}, "DELETE");
        router.replace("/admin?aba=contas");
        router.refresh();
        return;
      }
      const result = await authClient.signOut();
      if (result.error) throw new Error();
      router.replace("/login");
      router.refresh();
    } catch {
      toast.error("Não foi possível sair. Tente novamente.");
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            aria-label={`Minha conta, ${user.name}`}
            className={cn(quietButton, barItem, "sm:ml-1 sm:py-0.5 sm:pl-1")}
          />
        }
      >
        <Avatar aria-hidden className="size-6 sm:size-8">
          {user.image && <AvatarImage src={user.image} alt="" />}
          <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
            {initial}
          </AvatarFallback>
        </Avatar>
        <span className="sm:hidden">Conta</span>
        <span className="hidden sm:inline">Minha conta</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className="w-64 p-1">
        <div className="px-2.5 pt-2 pb-2.5">
          <p className="truncate text-sm font-medium">{user.name}</p>
          {user.email && (
            <p className="truncate text-xs text-muted-foreground">
              {user.email}
            </p>
          )}
        </div>
        <DropdownMenuSeparator />
        {[places, account].map((group, index) => (
          <div key={index}>
            {group.map(({ href, label, icon: Icon }) => (
              <MenuPrimitive.LinkItem
                key={href}
                closeOnClick
                render={<Link href={href} />}
                className={menuLink}
              >
                <Icon aria-hidden />
                {label}
              </MenuPrimitive.LinkItem>
            ))}
            <DropdownMenuSeparator />
          </div>
        ))}
        <ThemeMenuGroup />
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={logout}
          className="h-8 gap-2 px-2.5 pointer-coarse:h-10 [&_svg]:text-muted-foreground"
        >
          <LogOut aria-hidden />
          Sair da conta
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
