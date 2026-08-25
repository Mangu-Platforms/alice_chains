import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import { useSocket } from "@/hooks/useSocket";
import { trpc } from "@/providers/trpc";
import { useNavigate } from "react-router";
import {
  MessageCircle,
  MoreVertical,
  Phone,
  Video,
  Search,
  Users,
  LogOut,
  Send,
  Paperclip,
  Check,
  CheckCheck,
  UserPlus,
  Menu,
  X,
  Pencil,
  Trash2,
  SmilePlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import { toast } from "sonner";
import { MAX_MESSAGE_LENGTH } from "@contracts/constants";
import { REACTION_EMOJI } from "@contracts/reactions";

export default function Chat() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeConversationId = searchParams.get("c")
    ? parseInt(searchParams.get("c")!)
    : null;

  const socket = useSocket();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [messageInput, setMessageInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [typingUsers, setTypingUsers] = useState<Set<number>>(new Set());
  // F-2. The message currently being edited in place, and its draft body.
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<Set<number>>(new Set());

  // tRPC queries
  const { data: conversations, refetch: refetchConversations } =
    trpc.conversation.list.useQuery();

  const { data: activeConversation } = trpc.conversation.getById.useQuery(
    { id: activeConversationId! },
    { enabled: !!activeConversationId }
  );

  const { data: messages, refetch: refetchMessages } =
    trpc.message.listByConversation.useQuery(
      { conversationId: activeConversationId!, limit: 50 },
      { enabled: !!activeConversationId }
    );

  // F-1. Opening a conversation clears its badge. This writes
  // `conversation_participants.lastReadAt`, which is what `conversation.list`
  // counts from — the socket `markAsRead` writes per-message receipts for the
  // sender's delivery ticks and does not move the read marker.
  const markConversationRead = trpc.conversation.markAsRead.useMutation({
    onSuccess: () => refetchConversations(),
  });

  // Depends on `.mutate`, which is stable across renders, rather than on the
  // mutation object, which is not — depending on the object would re-run the
  // effect below on every render and mark the conversation read in a loop.
  const { mutate: sendMarkRead } = markConversationRead;
  const markActiveConversationRead = useCallback(() => {
    if (!activeConversationId) return;
    sendMarkRead({ conversationId: activeConversationId });
  }, [activeConversationId, sendMarkRead]);

  useEffect(() => {
    markActiveConversationRead();
  }, [markActiveConversationRead]);

  const editMessage = trpc.message.edit.useMutation({
    onSuccess: () => {
      setEditingMessageId(null);
      setEditDraft("");
      refetchMessages();
      refetchConversations();
    },
    onError: (error) => toast.error(error.message),
  });

  // F-3. The server decides add-vs-remove from what is stored, so the client
  // sends only the emoji and re-renders from the summary that comes back.
  const react = trpc.message.react.useMutation({
    onSuccess: () => refetchMessages(),
    onError: (error) => toast.error(error.message),
  });

  const deleteMessage = trpc.message.delete.useMutation({
    onSuccess: () => {
      setPendingDeleteId(null);
      refetchMessages();
      refetchConversations();
    },
    onError: (error) => {
      setPendingDeleteId(null);
      toast.error(error.message);
    },
  });

  const startEditing = (id: number, content: string) => {
    setEditingMessageId(id);
    setEditDraft(content);
  };

  const cancelEditing = () => {
    setEditingMessageId(null);
    setEditDraft("");
  };

  const submitEdit = () => {
    const content = editDraft.trim();
    if (!editingMessageId) return;
    if (!content) {
      toast.error("A message cannot be empty. Delete it instead.");
      return;
    }
    editMessage.mutate({ messageId: editingMessageId, content });
  };

  // Join socket room for active conversation
  useEffect(() => {
    if (activeConversationId && user) {
      socket.joinConversation(activeConversationId);
      socket.join(user.id);
      return () => {
        socket.leaveConversation(activeConversationId);
      };
    }
  }, [activeConversationId, user, socket]);

  // Listen for new messages
  useEffect(() => {
    const cleanup = socket.onNewMessage((message) => {
      if (message.conversationId === activeConversationId) {
        refetchMessages();
        if (message.senderId !== user?.id) {
          // Two writes, two purposes: the receipt drives the sender's read
          // ticks, the read marker drives our own unread badge.
          socket.markAsRead([message.id], message.conversationId);
          markActiveConversationRead();
        }
      }
      refetchConversations();
    });
    return cleanup;
  }, [
    activeConversationId,
    socket,
    refetchMessages,
    refetchConversations,
    user,
    markActiveConversationRead,
  ]);

  // F-2. Edits and deletes originate on the tRPC path and are fanned out by
  // the server, so an open client converges without polling.
  useEffect(() => {
    const cleanupUpdated = socket.onMessageUpdated((data) => {
      if (data.conversationId === activeConversationId) refetchMessages();
    });
    const cleanupDeleted = socket.onMessageDeleted((data) => {
      if (data.conversationId === activeConversationId) refetchMessages();
      // The sidebar preview may have been that message.
      refetchConversations();
    });
    const cleanupReaction = socket.onReactionUpdated((data) => {
      if (data.conversationId === activeConversationId) refetchMessages();
    });
    return () => {
      cleanupUpdated();
      cleanupDeleted();
      cleanupReaction();
    };
  }, [activeConversationId, socket, refetchMessages, refetchConversations]);

  // Listen for conversation updates
  useEffect(() => {
    const cleanup = socket.onConversationUpdated(() => {
      refetchConversations();
    });
    return cleanup;
  }, [socket, refetchConversations]);

  // Listen for typing indicators
  useEffect(() => {
    const cleanup = socket.onUserTyping((data) => {
      if (data.conversationId === activeConversationId) {
        setTypingUsers((prev) => {
          const next = new Set(prev);
          if (data.isTyping) {
            next.add(data.userId);
          } else {
            next.delete(data.userId);
          }
          return next;
        });
      }
    });
    return cleanup;
  }, [activeConversationId, socket]);

  // Listen for online users
  useEffect(() => {
    const cleanup1 = socket.onOnlineUsers((userIds) => {
      setOnlineUsers(new Set(userIds));
    });
    const cleanup2 = socket.onUserOnline(({ userId }) => {
      setOnlineUsers((prev) => new Set(prev).add(userId));
    });
    const cleanup3 = socket.onUserOffline(({ userId }) => {
      setOnlineUsers((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    });
    return () => {
      cleanup1();
      cleanup2();
      cleanup3();
    };
  }, [socket]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handle mobile
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const handleSendMessage = useCallback(() => {
    if (!messageInput.trim() || !activeConversationId) return;

    socket.sendMessage({
      conversationId: activeConversationId,
      content: messageInput.trim(),
      type: "text",
    });

    setMessageInput("");
  }, [messageInput, activeConversationId, socket]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    },
    [handleSendMessage]
  );

  const handleTyping = useCallback(
    (value: string) => {
      setMessageInput(value);
      if (activeConversationId) {
        socket.setTyping(activeConversationId, value.length > 0);
      }
    },
    [activeConversationId, socket]
  );

  const selectConversation = (id: number) => {
    setSearchParams({ c: id.toString() });
    if (isMobile) setSidebarOpen(false);
  };

  const filteredConversations = conversations?.filter((conv) =>
    conv.displayName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const isUserOnline = (userId: number) => onlineUsers.has(userId);

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen || !isMobile
            ? "translate-x-0"
            : "-translate-x-full"
        } ${
          isMobile ? "absolute z-50 w-80" : "w-80 relative"
        } flex-shrink-0 h-full border-r border-border bg-card/50 backdrop-blur-sm transition-transform duration-200 flex flex-col`}
      >
        {/* Sidebar Header */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/80 to-primary/40 flex items-center justify-center">
                <MessageCircle className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="font-bold text-lg leading-tight">Alice Chains</h1>
                <p className="text-xs text-muted-foreground">
                  {onlineUsers.size} online
                </p>
              </div>
            </div>
            {isMobile && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSidebarOpen(false)}
              >
                <X className="w-5 h-5" />
              </Button>
            )}
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search conversations..."
              className="pl-9 bg-secondary/50 border-0"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Conversations List */}
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {filteredConversations?.map((conv) => (
              <button
                key={conv.id}
                onClick={() => selectConversation(conv.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all duration-150 text-left group ${
                  activeConversationId === conv.id
                    ? "bg-primary/10 border border-primary/20"
                    : "hover:bg-secondary/60 border border-transparent"
                }`}
              >
                <div className="relative flex-shrink-0">
                  <Avatar className="w-12 h-12">
                    <AvatarImage src={conv.displayAvatar || undefined} />
                    <AvatarFallback className="bg-primary/20 text-primary">
                      {conv.displayName?.charAt(0).toUpperCase() || "?"}
                    </AvatarFallback>
                  </Avatar>
                  {conv.type === "direct" &&
                    conv.participants.find(
                      (p) =>
                        p.userId !== user?.id && isUserOnline(p.userId)
                    ) && (
                      <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 border-2 border-background rounded-full" />
                    )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-sm truncate ${
                        conv.unreadCount > 0 ? "font-semibold" : "font-medium"
                      }`}
                    >
                      {conv.displayName}
                    </span>
                    {conv.latestMessage && (
                      <span className="text-[11px] text-muted-foreground flex-shrink-0">
                        {format(new Date(conv.latestMessage.createdAt), "HH:mm")}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p
                      className={`text-xs truncate ${
                        conv.unreadCount > 0
                          ? "text-foreground/80"
                          : "text-muted-foreground"
                      }`}
                    >
                      {conv.latestMessage
                        ? `${
                            conv.latestMessage.senderId === user?.id
                              ? "You: "
                              : ""
                          }${conv.latestMessage.content}`
                        : "No messages yet"}
                    </p>
                    {conv.unreadCount > 0 && (
                      // A bare number means nothing to a screen reader, so the
                      // visible glyph is hidden from it and the label carries
                      // the meaning.
                      <span
                        className="flex-shrink-0 min-w-[1.25rem] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[11px] font-semibold flex items-center justify-center tabular-nums"
                        aria-label={`${conv.unreadCount} unread ${
                          conv.unreadCount === 1 ? "message" : "messages"
                        }`}
                      >
                        <span aria-hidden="true">
                          {conv.unreadCount > 99 ? "99+" : conv.unreadCount}
                        </span>
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}

            {filteredConversations?.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-40" />
                <p className="text-sm">No conversations yet</p>
                <p className="text-xs mt-1">
                  Start a chat from your contacts
                </p>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Sidebar Footer */}
        <div className="p-3 border-t border-border">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 gap-2"
              onClick={() => navigate("/contacts")}
            >
              <Users className="w-4 h-4" />
              Contacts
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => navigate("/contacts")}
                  className="gap-2"
                >
                  <UserPlus className="w-4 h-4" />
                  Add Contact
                </DropdownMenuItem>
                <DropdownMenuItem onClick={logout} className="gap-2 text-destructive">
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </aside>

      {/* Chat Area */}
      <main className="flex-1 flex flex-col h-full bg-background/50">
        {activeConversation && activeConversationId ? (
          <>
            {/* Chat Header */}
            <header className="flex items-center gap-4 px-4 py-3 border-b border-border bg-card/30 backdrop-blur-sm">
              {isMobile && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSidebarOpen(true)}
                >
                  <Menu className="w-5 h-5" />
                </Button>
              )}
              <div className="relative">
                <Avatar className="w-10 h-10">
                  <AvatarImage src={activeConversation.displayAvatar || undefined} />
                  <AvatarFallback className="bg-primary/20 text-primary">
                    {activeConversation.displayName?.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                {activeConversation.type === "direct" &&
                  activeConversation.participants.find(
                    (p) => p.userId !== user?.id && isUserOnline(p.userId)
                  ) && (
                    <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-background rounded-full" />
                  )}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-sm truncate">
                  {activeConversation.displayName}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {activeConversation.type === "direct"
                    ? activeConversation.participants.find(
                        (p) =>
                          p.userId !== user?.id && isUserOnline(p.userId)
                      )
                      ? "Online"
                      : "Offline"
                    : `${activeConversation.participants.length} members`}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="hidden sm:flex">
                  <Phone className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="hidden sm:flex">
                  <Video className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon">
                  <Search className="w-4 h-4" />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem>View Profile</DropdownMenuItem>
                    <DropdownMenuItem>Mute Notifications</DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive">
                      Block User
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </header>

            {/* Messages Area */}
            <ScrollArea className="flex-1 px-4">
              <div className="py-4 space-y-1">
                {messages?.map((msg, i) => {
                  const showAvatar =
                    !msg.isMine &&
                    (i === 0 || messages[i - 1].senderId !== msg.senderId);
                  const isFirstInGroup =
                    i === 0 || messages[i - 1].senderId !== msg.senderId;

                  return (
                    <div
                      key={msg.id}
                      className={`flex ${
                        msg.isMine ? "justify-end" : "justify-start"
                      } mb-1`}
                    >
                      <div
                        className={`flex items-end gap-2 max-w-[75%] ${
                          msg.isMine ? "flex-row-reverse" : ""
                        }`}
                      >
                        {showAvatar ? (
                          <Avatar className="w-7 h-7 flex-shrink-0">
                            <AvatarImage src={msg.senderAvatar || undefined} />
                            <AvatarFallback className="text-[10px] bg-primary/20">
                              {msg.senderName?.charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                        ) : (
                          !msg.isMine && <div className="w-7 flex-shrink-0" />
                        )}
                        <div
                          className={`group px-4 py-2 text-sm leading-relaxed ${
                            msg.isMine
                              ? "message-bubble-mine"
                              : "message-bubble-theirs"
                          } ${isFirstInGroup ? "mt-2" : ""}`}
                        >
                          {!msg.isMine && showAvatar && (
                            <p className="text-[11px] font-medium text-primary/70 mb-1">
                              {msg.senderName}
                            </p>
                          )}
                          {msg.deletedAt ? (
                            <p className="italic opacity-60">Message deleted</p>
                          ) : editingMessageId === msg.id ? (
                            <div className="space-y-2">
                              <Input
                                value={editDraft}
                                onChange={(e) => setEditDraft(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    submitEdit();
                                  }
                                  if (e.key === "Escape") cancelEditing();
                                }}
                                maxLength={MAX_MESSAGE_LENGTH}
                                aria-label="Edit message"
                                autoFocus
                                className="h-8 bg-background/40 border-0"
                              />
                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  onClick={submitEdit}
                                  disabled={editMessage.isPending}
                                >
                                  {editMessage.isPending ? "Saving…" : "Save"}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2 text-xs"
                                  onClick={cancelEditing}
                                  disabled={editMessage.isPending}
                                >
                                  Cancel
                                </Button>
                                <span className="text-[10px] opacity-60">
                                  Enter to save · Esc to cancel
                                </span>
                              </div>
                            </div>
                          ) : (
                            <p>{msg.content}</p>
                          )}
                          <div
                            className={`flex items-center gap-1 mt-1 ${
                              msg.isMine ? "justify-end" : "justify-start"
                            }`}
                          >
                            <span className="text-[10px] opacity-60">
                              {format(new Date(msg.createdAt), "HH:mm")}
                            </span>
                            {msg.isEdited && !msg.deletedAt && (
                              <span className="text-[10px] opacity-60">edited</span>
                            )}
                            {msg.isMine && !msg.deletedAt && (
                              <span className="opacity-60">
                                {msg.readBy && msg.readBy.length > 0 ? (
                                  <CheckCheck className="w-3 h-3" />
                                ) : (
                                  <Check className="w-3 h-3" />
                                )}
                              </span>
                            )}
                            {!msg.deletedAt && editingMessageId !== msg.id && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus:opacity-100 transition-opacity ml-1"
                                    aria-label="Add a reaction"
                                  >
                                    <SmilePlus className="w-3 h-3" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                  align={msg.isMine ? "end" : "start"}
                                  className="flex gap-1 p-1 min-w-0"
                                >
                                  {REACTION_EMOJI.map((emoji) => (
                                    <button
                                      key={emoji}
                                      onClick={() =>
                                        react.mutate({ messageId: msg.id, emoji })
                                      }
                                      className="text-lg leading-none p-1.5 rounded-md hover:bg-secondary transition-colors"
                                      aria-label={`React with ${emoji}`}
                                    >
                                      {emoji}
                                    </button>
                                  ))}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                            {msg.isMine &&
                              !msg.deletedAt &&
                              editingMessageId !== msg.id && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <button
                                      className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus:opacity-100 transition-opacity ml-1"
                                      aria-label="Message actions"
                                    >
                                      <MoreVertical className="w-3 h-3" />
                                    </button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem
                                      className="gap-2"
                                      onClick={() => startEditing(msg.id, msg.content)}
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                      Edit
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      className="gap-2 text-destructive"
                                      onClick={() => {
                                        setPendingDeleteId(msg.id);
                                        deleteMessage.mutate({ messageId: msg.id });
                                      }}
                                      disabled={pendingDeleteId === msg.id}
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                      {pendingDeleteId === msg.id
                                        ? "Deleting…"
                                        : "Delete"}
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                          </div>
                          {msg.reactions.length > 0 && !msg.deletedAt && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {msg.reactions.map((reaction) => (
                                <button
                                  key={reaction.emoji}
                                  onClick={() =>
                                    react.mutate({
                                      messageId: msg.id,
                                      emoji: reaction.emoji as (typeof REACTION_EMOJI)[number],
                                    })
                                  }
                                  className={`flex items-center gap-1 px-1.5 h-6 rounded-full text-[11px] border transition-colors ${
                                    reaction.mine
                                      ? "bg-primary/20 border-primary/40"
                                      : "bg-background/30 border-border/50 hover:bg-background/50"
                                  }`}
                                  aria-pressed={reaction.mine}
                                  aria-label={`${reaction.emoji}, ${reaction.count} ${
                                    reaction.count === 1 ? "reaction" : "reactions"
                                  }${reaction.mine ? ", including yours" : ""}`}
                                >
                                  <span aria-hidden="true">{reaction.emoji}</span>
                                  <span aria-hidden="true" className="tabular-nums">
                                    {reaction.count}
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {typingUsers.size > 0 && (
                  <div className="flex items-center gap-2 py-2">
                    <div className="flex gap-1 px-4 py-2 bg-secondary rounded-2xl rounded-bl-sm">
                      <span
                        className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce"
                        style={{ animationDelay: "0ms" }}
                      />
                      <span
                        className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce"
                        style={{ animationDelay: "150ms" }}
                      />
                      <span
                        className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce"
                        style={{ animationDelay: "300ms" }}
                      />
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            {/* Message Input */}
            <div className="p-4 border-t border-border">
              <div className="flex items-end gap-2 max-w-4xl mx-auto">
                <Button variant="ghost" size="icon" className="flex-shrink-0">
                  <Paperclip className="w-5 h-5 text-muted-foreground" />
                </Button>
                <div className="flex-1 relative">
                  <textarea
                    value={messageInput}
                    onChange={(e) => handleTyping(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type a message..."
                    rows={1}
                    className="w-full resize-none rounded-xl border border-border bg-secondary/50 px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 min-h-[44px] max-h-[120px]"
                    style={{ scrollbarWidth: "none" }}
                  />
                </div>
                <Button
                  onClick={handleSendMessage}
                  disabled={!messageInput.trim()}
                  size="icon"
                  className="flex-shrink-0 rounded-xl h-11 w-11"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </>
        ) : (
          /* Empty State */
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-sm px-4">
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mx-auto mb-6">
                <MessageCircle className="w-10 h-10 text-primary/70" />
              </div>
              <h2 className="text-xl font-bold mb-2">
                Welcome to Alice Chains
              </h2>
              <p className="text-sm text-muted-foreground mb-6">
                Select a conversation from the sidebar or add contacts to start
                messaging.
              </p>
              <Button
                onClick={() => navigate("/contacts")}
                className="gap-2"
              >
                <Users className="w-4 h-4" />
                Go to Contacts
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
