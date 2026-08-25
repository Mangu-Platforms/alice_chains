import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import { useSocket } from "@/hooks/useSocket";
import { usePushNotifications } from "@/hooks/usePushNotifications";
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
  Reply,
  FileText,
  Bell,
  BellOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { t, formatTime, formatMessageTimestamp } from "@/i18n";
import { LiveRegion } from "@/components/LiveRegion";
import { MAX_MESSAGE_LENGTH } from "@contracts/constants";
import { REACTION_EMOJI } from "@contracts/reactions";
import {
  ALLOWED_MIME_TYPES,
  MAX_ATTACHMENT_BYTES,
  formatBytes,
  isAllowedMimeType,
} from "@contracts/attachments";

export default function Chat() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeConversationId = searchParams.get("c")
    ? parseInt(searchParams.get("c")!)
    : null;

  const socket = useSocket();
  // F-6. Permission is requested from a control the member pressed, never on
  // load — a prompt fired at arrival is the fastest route to a permanent no.
  const push = usePushNotifications();
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
  // F-5. The message the composer is currently replying to, if any.
  // S-20. What a screen reader should be told about, most recently. Rendered
  // into a polite live region below.
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<{
    id: number;
    content: string;
    senderName: string | null;
  } | null>(null);
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
  // F-7. Group administration lives behind the header menu; every mutation
  // refetches the conversation and the sidebar, and the server also fans out
  // `conversationUpdated` so other members converge without acting.
  // F-4. The paperclip was a button that did nothing. It now runs the
  // three-step upload the server expects: ask for a target, PUT the bytes
  // straight to storage, then send a message naming the attachment.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [groupNameDraft, setGroupNameDraft] = useState("");

  const { data: blockedContacts, refetch: refetchBlocked } =
    trpc.contact.blocked.useQuery();
  // Only accepted contacts can be added to a group, so the picker below shows
  // exactly the people the caller could legitimately invite.
  const { data: contacts } = trpc.contact.list.useQuery();

  const blockUser = trpc.contact.block.useMutation({
    onSuccess: () => {
      toast.success("Blocked. They can no longer message you.");
      refetchBlocked();
      refetchConversations();
    },
    onError: (error) => toast.error(error.message),
  });

  const unblockUser = trpc.contact.unblock.useMutation({
    onSuccess: () => {
      toast.success("Unblocked.");
      refetchBlocked();
      refetchConversations();
    },
    onError: (error) => toast.error(error.message),
  });

  const utils = trpc.useUtils();
  const createUpload = trpc.attachment.createUpload.useMutation();
  const completeUpload = trpc.attachment.complete.useMutation();
  const sendWithAttachment = trpc.message.send.useMutation({
    onSuccess: () => {
      refetchMessages();
      refetchConversations();
    },
    onError: (error) => toast.error(error.message),
  });

  const handleFilesSelected = useCallback(
    async (files: FileList | null) => {
      if (!files?.length || !activeConversationId) return;
      const file = files[0];

      if (!isAllowedMimeType(file.type)) {
        toast.error(`${file.type || "That file type"} cannot be attached.`);
        return;
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        toast.error(`Files must be ${formatBytes(MAX_ATTACHMENT_BYTES)} or smaller.`);
        return;
      }

      setUploading(true);
      try {
        const target = await createUpload.mutateAsync({
          conversationId: activeConversationId,
          fileName: file.name,
          mimeType: file.type as never,
          byteSize: file.size,
        });

        // Straight to storage. With STORAGE_DRIVER=s3 this leaves the app
        // entirely; with the local driver it hits the signed upload endpoint.
        const put = await fetch(target.uploadUrl, {
          method: "PUT",
          headers: target.headers,
          body: file,
        });
        if (!put.ok) throw new Error("The upload failed. Please try again.");

        await completeUpload.mutateAsync({ attachmentId: target.attachmentId });

        // Sent over tRPC rather than the socket, because only this path can
        // carry an attachment id; the server fans the message out either way.
        await sendWithAttachment.mutateAsync({
          conversationId: activeConversationId,
          content: messageInput.trim(),
          attachmentIds: [target.attachmentId],
          replyToId: replyingTo?.id,
        });

        setMessageInput("");
        setReplyingTo(null);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "The upload failed.");
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [
      activeConversationId,
      createUpload,
      completeUpload,
      sendWithAttachment,
      messageInput,
      replyingTo,
    ]
  );
  const afterGroupChange = (message: string) => () => {
    toast.success(message);
    utils.conversation.getById.invalidate();
    refetchConversations();
  };
  const onGroupError = (error: { message: string }) => toast.error(error.message);

  const renameGroup = trpc.conversation.rename.useMutation({
    onSuccess: () => {
      setGroupDialogOpen(false);
      afterGroupChange("Group renamed")();
    },
    onError: onGroupError,
  });
  const addParticipants = trpc.conversation.addParticipants.useMutation({
    onSuccess: afterGroupChange("Member added"),
    onError: onGroupError,
  });
  const removeParticipant = trpc.conversation.removeParticipant.useMutation({
    onSuccess: afterGroupChange("Member removed"),
    onError: onGroupError,
  });
  const transferOwnership = trpc.conversation.transferOwnership.useMutation({
    onSuccess: afterGroupChange("Ownership transferred"),
    onError: onGroupError,
  });
  const leaveGroup = trpc.conversation.leave.useMutation({
    onSuccess: () => {
      setGroupDialogOpen(false);
      toast.success("You left the group");
      setSearchParams({});
      refetchConversations();
    },
    onError: onGroupError,
  });

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
          // The DOM changes silently for a screen reader user, so say it.
          setAnnouncement(
            t("live.newMessageFrom", conversations?.find((c) => c.id === message.conversationId)
              ?.participants.find((p) => p.userId === message.senderId)?.userName ?? "someone")
          );
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
    // S-13. A refused send is silent on the wire; without this the composer
    // clears and the message simply never appears.
    const cleanupRateLimited = socket.socket?.on("rateLimited", (data: { retryAfterMs: number }) => {
      toast.error(
        `You are sending too fast. Try again in ${Math.ceil(data.retryAfterMs / 1000)}s.`
      );
    });
    void cleanupRateLimited;
    // S-14. Only ever a client bug, so it is logged rather than shown — but it
    // is logged, because silence here is how a shape mismatch survives a
    // release.
    socket.socket?.on("invalidPayload", (data: { event: string; message: string }) => {
      console.error(`Server rejected "${data.event}": ${data.message}`);
    });
    const cleanupReaction = socket.onReactionUpdated((data) => {
      if (data.conversationId === activeConversationId) refetchMessages();
    });
    return () => {
      cleanupUpdated();
      cleanupDeleted();
      cleanupReaction();
      socket.socket?.off("rateLimited");
      socket.socket?.off("invalidPayload");
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
      replyToId: replyingTo?.id,
    });

    setMessageInput("");
    setReplyingTo(null);
  }, [messageInput, activeConversationId, socket, replyingTo]);

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
    const opened = conversations?.find((c) => c.id === id);
    setAnnouncement(t("live.conversationOpened", opened?.displayName ?? ""));
    // A reply target belongs to the conversation it came from; carrying it
    // across would be rejected by the server (FR-MSG-15) and confusing here.
    setReplyingTo(null);
    setEditingMessageId(null);
    if (isMobile) setSidebarOpen(false);
  };

  const filteredConversations = conversations?.filter((conv) =>
    conv.displayName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const isUserOnline = (userId: number) => onlineUsers.has(userId);

  // F-8. Blocking is a person-to-person act, so it is only offered on a direct
  // conversation — there is no single "other member" of a group to block.
  const otherMemberId =
    activeConversation?.type === "direct"
      ? (activeConversation.participants.find((p) => p.userId !== user?.id)?.userId ??
        null)
      : null;
  const isOtherMemberBlocked =
    otherMemberId !== null &&
    (blockedContacts ?? []).some((b) => b.contactUserId === otherMemberId);

  const isGroup = activeConversation?.type === "group";
  const isGroupOwner = isGroup && activeConversation?.createdBy === user?.id;
  const contactsNotInGroup = (contacts ?? []).filter(
    (c) => !activeConversation?.participants.some((p) => p.userId === c.contactUserId)
  );

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      <LiveRegion message={announcement} />
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
                  {t("count.onlineNow", onlineUsers.size)}
                </p>
              </div>
            </div>
            {isMobile && (
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("a11y.closeSidebar")}
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
          {/*
            S-20. A list of buttons, marked up as a list. Without the roles a
            screen reader reads eleven unrelated buttons; with them it says
            "list, eleven items" and offers list navigation. `aria-current`
            is what tells the reader which conversation is open — the visual
            highlight alone says nothing.
          */}
          <div className="p-2 space-y-1" role="list" aria-label="Conversations">
            {filteredConversations?.map((conv) => (
              <button
                key={conv.id}
                role="listitem"
                aria-current={activeConversationId === conv.id ? "true" : undefined}
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
                        {formatMessageTimestamp(conv.latestMessage.createdAt)}
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
                        : t("status.noMessagesYet")}
                    </p>
                    {conv.unreadCount > 0 && (
                      // A bare number means nothing to a screen reader, so the
                      // visible glyph is hidden from it and the label carries
                      // the meaning.
                      <span
                        className="flex-shrink-0 min-w-[1.25rem] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[11px] font-semibold flex items-center justify-center tabular-nums"
                        aria-label={t("count.unreadMessages", conv.unreadCount)}
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
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9"
                  aria-label={t("a11y.accountMenu")}
                >
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
                {push.available && (
                  <DropdownMenuItem
                    onClick={() => (push.subscribed ? push.disable() : push.enable())}
                    disabled={push.busy || push.permission === "denied"}
                    className="gap-2"
                  >
                    {push.subscribed ? (
                      <BellOff className="w-4 h-4" />
                    ) : (
                      <Bell className="w-4 h-4" />
                    )}
                    {push.permission === "denied"
                      ? "Notifications blocked"
                      : push.busy
                        ? "Working…"
                        : push.subscribed
                          ? "Turn off notifications"
                          : "Turn on notifications"}
                  </DropdownMenuItem>
                )}
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
                  aria-label={t("a11y.openSidebar")}
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
                      ? t("status.online")
                      : t("status.offline")
                    : t("count.members", activeConversation.participants.length)}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {/*
                  S-20 / P-UX-1. The phone, video and search icons sat here
                  doing nothing when pressed. Labelling a control that lies is
                  worse than removing it — a screen reader would then announce
                  "Start a voice call" for a button that starts nothing. They
                  come back when P-CALL-1/2 and P-SEARCH-1 ship.
                */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("a11y.conversationMenu")}
                    >
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {/*
                      F-8. "Block User" now blocks. "View Profile" and "Mute
                      Notifications" were stubs that did nothing when clicked;
                      they are gone until the tasks that own them ship, because
                      a control that lies is worse than one that is absent.
                    */}
                    {isGroup && (
                      <DropdownMenuItem
                        onClick={() => {
                          setGroupNameDraft(activeConversation?.name ?? "");
                          setGroupDialogOpen(true);
                        }}
                        className="gap-2"
                      >
                        <Users className="w-4 h-4" />
                        Group settings
                      </DropdownMenuItem>
                    )}
                    {otherMemberId !== null &&
                      (isOtherMemberBlocked ? (
                        <DropdownMenuItem
                          onClick={() =>
                            unblockUser.mutate({ contactUserId: otherMemberId })
                          }
                          disabled={unblockUser.isPending}
                        >
                          {unblockUser.isPending ? "Unblocking…" : "Unblock"}
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() =>
                            blockUser.mutate({ contactUserId: otherMemberId })
                          }
                          disabled={blockUser.isPending}
                        >
                          {blockUser.isPending ? "Blocking…" : "Block user"}
                        </DropdownMenuItem>
                      ))}
                    <DropdownMenuItem
                      onClick={() => navigate("/contacts")}
                      className="gap-2"
                    >
                      <Users className="w-4 h-4" />
                      Manage contacts
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </header>

            {/* Messages Area */}
            <ScrollArea className="flex-1 px-4">
              {/*
                A log, not a list: `role="log"` tells a screen reader that
                entries are appended over time, which is what makes its
                "read new entries" behaviour work.
              */}
              <div className="py-4 space-y-1" role="log" aria-label="Messages">
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
                          {msg.replyToId && !msg.deletedAt && (
                            <div className="mb-1.5 pl-2 border-l-2 border-current/30 opacity-70">
                              <p className="text-[11px] font-medium">
                                {msg.replyToSenderId === user?.id
                                  ? "You"
                                  : msg.replyToSenderName || "Unknown"}
                              </p>
                              <p className="text-[11px] truncate max-w-[240px]">
                                {msg.replyToDeletedAt
                                  ? "Message deleted"
                                  : msg.replyToContent}
                              </p>
                            </div>
                          )}
                          {msg.deletedAt ? (
                            <p className="italic opacity-60">{t("status.messageDeleted")}</p>
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
                                aria-label={t("a11y.editMessage")}
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
                              {formatTime(msg.createdAt)}
                            </span>
                            {msg.isEdited && !msg.deletedAt && (
                              <span className="text-[10px] opacity-60">
                                {t("status.edited")}
                              </span>
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
                              <button
                                onClick={() =>
                                  setReplyingTo({
                                    id: msg.id,
                                    content: msg.content,
                                    senderName: msg.isMine
                                      ? "You"
                                      : msg.senderName,
                                  })
                                }
                                className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus:opacity-100 transition-opacity ml-1"
                                aria-label={t("a11y.replyToMessage")}
                              >
                                <Reply className="w-3 h-3" />
                              </button>
                            )}
                            {!msg.deletedAt && editingMessageId !== msg.id && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus:opacity-100 transition-opacity ml-1"
                                    aria-label={t("a11y.addReaction")}
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
                                      aria-label={t("a11y.reactWith", emoji)}
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
                                      aria-label={t("a11y.messageActions")}
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
                          {!msg.deletedAt &&
                            msg.attachments.map((attachment) =>
                              attachment.isImage ? (
                                <a
                                  key={attachment.id}
                                  href={attachment.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="block mt-2"
                                >
                                  <img
                                    src={attachment.url}
                                    alt={attachment.fileName}
                                    loading="lazy"
                                    className="rounded-lg max-h-64 max-w-full object-contain bg-background/20"
                                  />
                                </a>
                              ) : (
                                <a
                                  key={attachment.id}
                                  href={attachment.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  download={attachment.fileName}
                                  className="mt-2 flex items-center gap-2 px-2 py-1.5 rounded-lg bg-background/25 hover:bg-background/40 transition-colors"
                                >
                                  <FileText className="w-4 h-4 flex-shrink-0" />
                                  <span className="flex-1 min-w-0 truncate text-xs">
                                    {attachment.fileName}
                                  </span>
                                  <span className="text-[10px] opacity-70 flex-shrink-0">
                                    {formatBytes(attachment.byteSize)}
                                  </span>
                                </a>
                              )
                            )}
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
                                  aria-label={t(
                                    "count.reactions",
                                    reaction.emoji,
                                    reaction.count,
                                    reaction.mine
                                  )}
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

            {/* F-7 · Group settings */}
            <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Group settings</DialogTitle>
                </DialogHeader>
                <div className="space-y-5">
                  <div className="space-y-2">
                    <label htmlFor="group-name" className="text-sm font-medium">
                      Name
                    </label>
                    <div className="flex gap-2">
                      <Input
                        id="group-name"
                        value={groupNameDraft}
                        onChange={(e) => setGroupNameDraft(e.target.value)}
                        maxLength={100}
                        disabled={!isGroupOwner}
                        placeholder="Group name"
                      />
                      <Button
                        onClick={() =>
                          activeConversationId &&
                          renameGroup.mutate({
                            conversationId: activeConversationId,
                            name: groupNameDraft.trim(),
                          })
                        }
                        disabled={
                          !isGroupOwner ||
                          renameGroup.isPending ||
                          !groupNameDraft.trim() ||
                          groupNameDraft.trim() === activeConversation?.name
                        }
                      >
                        {renameGroup.isPending ? "Saving…" : "Save"}
                      </Button>
                    </div>
                    {!isGroupOwner && (
                      <p className="text-xs text-muted-foreground">
                        Only the group owner can change these.
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-medium">
                      Members ({activeConversation?.participants.length ?? 0})
                    </p>
                    <ScrollArea className="max-h-48">
                      <ul className="space-y-1">
                        {activeConversation?.participants.map((p) => (
                          <li
                            key={p.userId}
                            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-secondary/50"
                          >
                            <Avatar className="w-7 h-7">
                              <AvatarImage src={p.userAvatar || undefined} />
                              <AvatarFallback className="text-[10px] bg-primary/20">
                                {p.userName?.charAt(0).toUpperCase() || "?"}
                              </AvatarFallback>
                            </Avatar>
                            <span className="flex-1 text-sm truncate">
                              {p.userName || "Unknown"}
                              {p.userId === activeConversation?.createdBy && (
                                <span className="ml-1.5 text-[10px] text-muted-foreground">
                                  owner
                                </span>
                              )}
                            </span>
                            {isGroupOwner && p.userId !== user?.id && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  onClick={() =>
                                    activeConversationId &&
                                    transferOwnership.mutate({
                                      conversationId: activeConversationId,
                                      newOwnerId: p.userId,
                                    })
                                  }
                                  disabled={transferOwnership.isPending}
                                >
                                  Make owner
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive"
                                  aria-label={t("a11y.removeMember", p.userName || "member")}
                                  onClick={() =>
                                    activeConversationId &&
                                    removeParticipant.mutate({
                                      conversationId: activeConversationId,
                                      userId: p.userId,
                                    })
                                  }
                                  disabled={removeParticipant.isPending}
                                >
                                  <X className="w-3.5 h-3.5" />
                                </Button>
                              </>
                            )}
                          </li>
                        ))}
                      </ul>
                    </ScrollArea>
                  </div>

                  {isGroupOwner && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Add a contact</p>
                      {contactsNotInGroup.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          Everyone in your contacts is already here.
                        </p>
                      ) : (
                        <ScrollArea className="max-h-40">
                          <ul className="space-y-1">
                            {contactsNotInGroup.map((c) => (
                              <li
                                key={c.contactUserId}
                                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-secondary/50"
                              >
                                <span className="flex-1 text-sm truncate">
                                  {c.contactName || "Unknown"}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  onClick={() =>
                                    activeConversationId &&
                                    addParticipants.mutate({
                                      conversationId: activeConversationId,
                                      userIds: [c.contactUserId],
                                    })
                                  }
                                  disabled={addParticipants.isPending}
                                >
                                  Add
                                </Button>
                              </li>
                            ))}
                          </ul>
                        </ScrollArea>
                      )}
                    </div>
                  )}

                  <div className="pt-2 border-t border-border">
                    <Button
                      variant="ghost"
                      className="w-full justify-start gap-2 text-destructive"
                      onClick={() =>
                        activeConversationId &&
                        leaveGroup.mutate({ conversationId: activeConversationId })
                      }
                      disabled={leaveGroup.isPending}
                    >
                      <LogOut className="w-4 h-4" />
                      {leaveGroup.isPending ? "Leaving…" : "Leave group"}
                    </Button>
                    {isGroupOwner &&
                      (activeConversation?.participants.length ?? 0) > 1 && (
                        <p className="text-xs text-muted-foreground px-3">
                          Transfer ownership to someone else before you can leave.
                        </p>
                      )}
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            {/* Message Input */}
            <div className="p-4 border-t border-border">
              {replyingTo && (
                <div className="max-w-4xl mx-auto mb-2 flex items-start gap-2 rounded-lg bg-secondary/50 border-l-2 border-primary px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium text-primary">
                      Replying to {replyingTo.senderName || "Unknown"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {replyingTo.content}
                    </p>
                  </div>
                  <button
                    onClick={() => setReplyingTo(null)}
                    aria-label={t("a11y.cancelReply")}
                    className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
              <div className="flex items-end gap-2 max-w-4xl mx-auto">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="sr-only"
                  accept={ALLOWED_MIME_TYPES.join(",")}
                  onChange={(e) => handleFilesSelected(e.target.files)}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="flex-shrink-0"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  aria-label={uploading ? t("a11y.uploading") : t("a11y.attachFile")}
                >
                  {uploading ? (
                    <Spinner className="w-5 h-5" />
                  ) : (
                    <Paperclip className="w-5 h-5 text-muted-foreground" />
                  )}
                </Button>
                <div className="flex-1 relative">
                  <textarea
                    value={messageInput}
                    onChange={(e) => handleTyping(e.target.value)}
                    onKeyDown={(e) => {
                      // Escape drops the reply target before it reaches the
                      // send handler, so the key does something useful whether
                      // or not a reply is in progress.
                      if (e.key === "Escape" && replyingTo) {
                        e.preventDefault();
                        setReplyingTo(null);
                        return;
                      }
                      handleKeyDown(e);
                    }}
                    aria-label={
                      replyingTo
                        ? `Reply to ${replyingTo.senderName || "message"}`
                        : "Type a message"
                    }
                    placeholder={
                      replyingTo ? "Type your reply..." : "Type a message..."
                    }
                    rows={1}
                    className="w-full resize-none rounded-xl border border-border bg-secondary/50 px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 min-h-[44px] max-h-[120px]"
                    style={{ scrollbarWidth: "none" }}
                  />
                </div>
                <Button
                  onClick={handleSendMessage}
                  disabled={!messageInput.trim()}
                  aria-label={t("a11y.sendMessage")}
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
