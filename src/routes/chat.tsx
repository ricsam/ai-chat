import { useChat } from "@ai-sdk/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Copy,
  Ellipsis,
  Menu,
  MessageSquare,
  Pencil,
  Plus,
  RefreshCcw,
  Settings,
  Sparkles,
  Trash2,
  Wrench,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DefaultChatTransport,
  type DynamicToolUIPart,
  type UIMessage,
} from "ai";
import { AppShell } from "@/components/app-shell";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  type PromptInputMessage,
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
  PromptInputSelectValue,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { api } from "@/lib/api";

type Chat = {
  id: string;
  title: string;
  modelId?: string | null;
  updatedAt: string;
};
type Model = {
  id: string;
  name: string;
  modelId: string;
  providerId: string;
  enabled: boolean;
};
type Provider = { id: string; name: string; models: Model[] };
type Mcp = {
  id: string;
  name: string;
  trustRequired: boolean;
  enabled: boolean;
};
export const Route = createFileRoute("/chat")({ component: ChatPage });

function ChatPage() {
  const navigate = useNavigate();
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeId, setActiveId] = useState("");
  const [models, setModels] = useState<Model[]>([]);
  const [mcps, setMcps] = useState<Mcp[]>([]);
  const [selectedMcp, setSelectedMcp] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ messages, body, trigger }) => ({
          body: {
            chatId: body?.chatId,
            message: trigger === "submit-message" ? messages.at(-1) : undefined,
            regenerate: trigger === "regenerate-message",
          },
        }),
      }),
    [],
  );
  const {
    messages: liveMessages,
    setMessages,
    sendMessage,
    regenerate,
    status,
    stop,
    error,
  } = useChat({ transport });
  const loadLists = useCallback(async () => {
    try {
      const [chatData, providerData, mcpData] = await Promise.all([
        api<{ chats: Chat[] }>("/api/chats"),
        api<{ providers: Provider[] }>("/api/providers"),
        api<{ servers: Mcp[] }>("/api/mcp"),
      ]);
      setChats(chatData.chats);
      setModels(providerData.providers.flatMap((p) => p.models));
      setMcps(mcpData.servers);
    } catch {
      void navigate({ to: "/" });
    }
  }, [navigate]);
  useEffect(() => {
    void loadLists();
  }, [loadLists]);
  const openChat = useCallback(
    async (id: string) => {
      const data = await api<{
        chat: Chat;
        messages: Array<{
          id: string;
          role: string;
          parts: UIMessage["parts"];
        }>;
        mcpServerIds: string[];
      }>(`/api/chats?id=${id}`);
      setActiveId(id);
      setMessages(data.messages as UIMessage[]);
      setSelectedMcp(data.mcpServerIds);
      setMobileOpen(false);
    },
    [setMessages],
  );
  useEffect(() => {
    if (!activeId && chats[0]) void openChat(chats[0].id);
  }, [activeId, chats, openChat]);
  const createChat = async () => {
    if (!models.length) {
      setNotice(
        "Connect a provider and model in Settings before starting a chat.",
      );
      return;
    }
    const data = await api<{ chat: Chat }>("/api/chats", {
      method: "POST",
      body: JSON.stringify({
        modelId: models.find((m) => m.enabled)?.id,
        mcpServerIds: [],
      }),
    });
    await loadLists();
    await openChat(data.chat.id);
    setMessages([]);
  };
  const active = chats.find((chat) => chat.id === activeId);
  const selectedModel = active?.modelId ?? models[0]?.id;
  const update = async (patch: object) => {
    if (!activeId) return;
    await api("/api/chats", {
      method: "PATCH",
      body: JSON.stringify({ id: activeId, ...patch }),
    });
    await loadLists();
  };
  const remove = async (id: string) => {
    if (!confirm("Delete this conversation permanently?")) return;
    await api(`/api/chats?id=${id}`, { method: "DELETE" });
    if (id === activeId) {
      setActiveId("");
      setMessages([]);
    }
    await loadLists();
  };
  const submit = async (message: PromptInputMessage) => {
    if (!message.text.trim() || !activeId) return;
    await sendMessage({ text: message.text }, { body: { chatId: activeId } });
    setInput("");
    setTimeout(() => void loadLists(), 600);
  };
  const toggleMcp = async (id: string) => {
    const next = selectedMcp.includes(id)
      ? selectedMcp.filter((item) => item !== id)
      : [...selectedMcp, id];
    setSelectedMcp(next);
    await update({ mcpServerIds: next });
  };
  const sidebar = (
    <ChatSidebar
      chats={chats}
      activeId={activeId}
      onOpen={openChat}
      onCreate={createChat}
      onDelete={remove}
    />
  );
  return (
    <AppShell sidebar={sidebar}>
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3 sm:px-5">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[290px] p-0">
              {sidebar}
            </SheetContent>
          </Sheet>
          <span className="truncate text-sm font-medium">
            {active?.title ?? "New conversation"}
          </span>
          <div className="ml-auto flex items-center gap-1">
            {active && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <Ellipsis />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => {
                      const title = prompt("Rename conversation", active.title);
                      if (title) void update({ title });
                    }}
                  >
                    <Pencil />
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => remove(active.id)}
                  >
                    <Trash2 />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
        {!activeId ? (
          <div className="grid flex-1 place-items-center p-6">
            <div className="max-w-md text-center">
              <div className="mx-auto mb-6 grid size-14 place-items-center rounded-2xl border bg-card shadow-sm">
                <Sparkles className="size-6 text-primary" />
              </div>
              <h1 className="font-serif text-4xl tracking-tight">
                Begin with a question.
              </h1>
              <p className="mt-3 leading-relaxed text-muted-foreground">
                Conversations stay private to your account, with your own models
                and trusted tools.
              </p>
              <Button size="lg" className="mt-7" onClick={createChat}>
                <Plus />
                New conversation
              </Button>
              {notice && (
                <p className="mt-4 text-sm text-amber-700">
                  {notice}{" "}
                  <Button variant="link" className="px-1" asChild>
                    <a href="/settings">Open settings</a>
                  </Button>
                </p>
              )}
            </div>
          </div>
        ) : (
          <>
            <Conversation className="min-h-0">
              <ConversationContent className="mx-auto w-full max-w-3xl gap-7 px-5 py-8 sm:px-8">
                {!liveMessages.length ? (
                  <ConversationEmptyState
                    icon={<MessageSquare className="size-9" />}
                    title="What are you working on?"
                    description="Ask a question, explore an idea, or work through a problem."
                  />
                ) : (
                  liveMessages.map((message) => (
                    <ChatMessage
                      key={message.id}
                      message={message}
                      streaming={
                        status === "streaming" &&
                        message.id === liveMessages.at(-1)?.id
                      }
                      onRegenerate={() =>
                        regenerate({ body: { chatId: activeId } })
                      }
                    />
                  ))
                )}
                {error && (
                  <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
                    {error.message}
                  </div>
                )}
              </ConversationContent>
              <ConversationScrollButton />
            </Conversation>
            <div className="safe-bottom shrink-0 bg-gradient-to-t from-background via-background to-transparent px-4 pt-3">
              <PromptInput className="mx-auto max-w-3xl" onSubmit={submit}>
                <PromptInputBody>
                  <PromptInputTextarea
                    value={input}
                    onChange={(e) => setInput(e.currentTarget.value)}
                    placeholder="Message your assistant…"
                  />
                </PromptInputBody>
                <PromptInputFooter>
                  <PromptInputTools>
                    <PromptInputSelect
                      value={selectedModel ?? ""}
                      onValueChange={(modelId) => update({ modelId })}
                    >
                      <PromptInputSelectTrigger>
                        <PromptInputSelectValue placeholder="Choose model" />
                      </PromptInputSelectTrigger>
                      <PromptInputSelectContent>
                        {models
                          .filter((m) => m.enabled)
                          .map((model) => (
                            <PromptInputSelectItem
                              key={model.id}
                              value={model.id}
                            >
                              {model.name}
                            </PromptInputSelectItem>
                          ))}
                      </PromptInputSelectContent>
                    </PromptInputSelect>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <Wrench />
                          Tools
                          {selectedMcp.length > 0 && (
                            <Badge className="ml-1 h-5 px-1.5">
                              {selectedMcp.length}
                            </Badge>
                          )}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        {mcps.filter((mcp) => mcp.enabled && !mcp.trustRequired)
                          .length ? (
                          mcps
                            .filter((mcp) => mcp.enabled && !mcp.trustRequired)
                            .map((mcp) => (
                              <DropdownMenuCheckboxItem
                                key={mcp.id}
                                checked={selectedMcp.includes(mcp.id)}
                                onCheckedChange={() => toggleMcp(mcp.id)}
                              >
                                {mcp.name}
                              </DropdownMenuCheckboxItem>
                            ))
                        ) : (
                          <DropdownMenuItem asChild>
                            <a href="/settings/mcp">
                              <Settings />
                              Connect MCP tools
                            </a>
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </PromptInputTools>
                  <PromptInputSubmit
                    status={status}
                    onStop={stop}
                    disabled={status === "ready" && !input.trim()}
                  />
                </PromptInputFooter>
              </PromptInput>
              <p className="mx-auto mt-2 max-w-3xl text-center text-[11px] text-muted-foreground">
                AI can make mistakes. Review important output and automatic tool
                actions.
              </p>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
function ChatSidebar({
  chats,
  activeId,
  onOpen,
  onCreate,
  onDelete,
}: {
  chats: Chat[];
  activeId: string;
  onOpen: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <>
      <div className="p-3">
        <Button
          className="w-full justify-start"
          variant="outline"
          onClick={onCreate}
        >
          <Plus />
          New conversation
        </Button>
      </div>
      <div className="px-3 pb-2 text-[11px] font-medium uppercase tracking-[.16em] text-muted-foreground">
        Recent
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2">
        {chats.map((chat) => (
          <div
            key={chat.id}
            className={`group flex items-center rounded-lg ${activeId === chat.id ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60"}`}
          >
            <button
              className="min-w-0 flex-1 truncate px-3 py-2.5 text-left text-sm"
              onClick={() => onOpen(chat.id)}
            >
              {chat.title}
            </button>
            <Button
              size="icon-sm"
              variant="ghost"
              className="mr-1 opacity-0 group-hover:opacity-100"
              onClick={() => onDelete(chat.id)}
            >
              <Trash2 />
            </Button>
          </div>
        ))}
      </div>
      <div className="border-t p-3">
        <Button asChild variant="ghost" className="w-full justify-start">
          <a href="/settings">
            <Settings />
            Settings
          </a>
        </Button>
      </div>
    </>
  );
}
function ChatMessage({
  message,
  streaming,
  onRegenerate,
}: {
  message: UIMessage;
  streaming: boolean;
  onRegenerate: () => void;
}) {
  const text = message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
  return (
    <Message from={message.role}>
      <MessageContent>
        {message.parts.map((part, index) => {
          if (part.type === "text")
            return (
              <MessageResponse key={index} isAnimating={streaming}>
                {part.text}
              </MessageResponse>
            );
          if (part.type === "reasoning")
            return (
              <Reasoning key={index} isStreaming={streaming}>
                <ReasoningTrigger />
                <ReasoningContent>{part.text}</ReasoningContent>
              </Reasoning>
            );
          if (part.type === "dynamic-tool") {
            const tool = part as DynamicToolUIPart;
            return (
              <Tool key={index} defaultOpen={tool.state === "output-error"}>
                <ToolHeader
                  type="dynamic-tool"
                  toolName={tool.toolName}
                  state={tool.state}
                />
                <ToolContent>
                  <ToolInput input={tool.input} />
                  <ToolOutput output={tool.output} errorText={tool.errorText} />
                </ToolContent>
              </Tool>
            );
          }
          return null;
        })}
      </MessageContent>
      <MessageActions className={message.role === "user" ? "justify-end" : ""}>
        {text && (
          <MessageAction
            tooltip="Copy"
            onClick={() => navigator.clipboard.writeText(text)}
          >
            <Copy />
          </MessageAction>
        )}
        {message.role === "assistant" && (
          <MessageAction tooltip="Regenerate" onClick={onRegenerate}>
            <RefreshCcw />
          </MessageAction>
        )}
      </MessageActions>
    </Message>
  );
}
