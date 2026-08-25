import { useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import type { Message } from "@db/schema";

interface ServerToClientEvents {
  newMessage: (message: Message & { tempId?: string }) => void;
  conversationUpdated: (data: {
    conversationId: number;
    lastMessage: Message;
  }) => void;
  messagesRead: (data: { messageIds: number[]; userId: number }) => void;
  userTyping: (data: {
    userId: number;
    conversationId: number;
    isTyping: boolean;
  }) => void;
  userOnline: (data: { userId: number }) => void;
  userOffline: (data: { userId: number }) => void;
  onlineUsers: (userIds: number[]) => void;
  messageError: (data: { error: string; tempId?: string }) => void;
  /** F-2. Emitted by the server after a tRPC edit. */
  messageUpdated: (data: {
    id: number;
    conversationId: number;
    content: string;
    isEdited: boolean;
  }) => void;
  /** F-2. Emitted by the server after a tRPC soft delete. */
  messageDeleted: (data: { id: number; conversationId: number }) => void;
  /** F-3. The full reaction summary for one message, after a toggle. */
  reactionUpdated: (data: {
    messageId: number;
    conversationId: number;
    added: boolean;
    reactions: { emoji: string; count: number; mine: boolean; userIds: number[] }[];
  }) => void;
  /**
   * The server found this connection's session revoked or expired and is about
   * to close it (S-17). Sent before the disconnect so the client can say
   * "signed out" rather than fall into a silent reconnect loop.
   */
  sessionExpired: () => void;
}

interface ClientToServerEvents {
  joinConversation: (data: { conversationId: number }) => void;
  leaveConversation: (data: { conversationId: number }) => void;
  sendMessage: (data: {
    conversationId: number;
    content: string;
    type?: string;
    fileUrl?: string;
    replyToId?: number;
    tempId?: string;
  }) => void;
  markAsRead: (data: { messageIds: number[]; conversationId: number }) => void;
  typing: (data: { conversationId: number; isTyping: boolean }) => void;
}

export function useSocket() {
  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);

  useEffect(() => {
    const socket = io({
      path: "/socket.io",
      transports: ["websocket", "polling"],
      autoConnect: true,
    });

    socketRef.current = socket;

    // A revoked session cannot be recovered by reconnecting, so stop trying and
    // send the browser to the login page.
    socket.on("sessionExpired", () => {
      socket.disconnect();
      window.location.href = "/login";
    });

    return () => {
      socket.off("sessionExpired");
      socket.disconnect();
    };
  }, []);

  const join = useCallback((_userId: number) => {
    socketRef.current?.connect();
  }, []);

  const joinConversation = useCallback((conversationId: number) => {
    socketRef.current?.emit("joinConversation", { conversationId });
  }, []);

  const leaveConversation = useCallback((conversationId: number) => {
    socketRef.current?.emit("leaveConversation", { conversationId });
  }, []);

  const sendMessage = useCallback(
    (data: {
      conversationId: number;
      content: string;
      type?: string;
      fileUrl?: string;
      replyToId?: number;
      tempId?: string;
    }) => {
      socketRef.current?.emit("sendMessage", data);
    },
    []
  );

  const markAsRead = useCallback(
    (messageIds: number[], conversationId: number) => {
      socketRef.current?.emit("markAsRead", { messageIds, conversationId });
    },
    []
  );

  const setTyping = useCallback(
    (conversationId: number, isTyping: boolean) => {
      socketRef.current?.emit("typing", { conversationId, isTyping });
    },
    []
  );

  const onNewMessage = useCallback(
    (handler: (message: Message & { tempId?: string }) => void) => {
      socketRef.current?.on("newMessage", handler);
      return () => {
        socketRef.current?.off("newMessage", handler);
      };
    },
    []
  );

  const onMessagesRead = useCallback(
    (handler: (data: { messageIds: number[]; userId: number }) => void) => {
      socketRef.current?.on("messagesRead", handler);
      return () => {
        socketRef.current?.off("messagesRead", handler);
      };
    },
    []
  );

  const onUserTyping = useCallback(
    (
      handler: (data: {
        userId: number;
        conversationId: number;
        isTyping: boolean;
      }) => void
    ) => {
      socketRef.current?.on("userTyping", handler);
      return () => {
        socketRef.current?.off("userTyping", handler);
      };
    },
    []
  );

  const onUserOnline = useCallback(
    (handler: (data: { userId: number }) => void) => {
      socketRef.current?.on("userOnline", handler);
      return () => {
        socketRef.current?.off("userOnline", handler);
      };
    },
    []
  );

  const onUserOffline = useCallback(
    (handler: (data: { userId: number }) => void) => {
      socketRef.current?.on("userOffline", handler);
      return () => {
        socketRef.current?.off("userOffline", handler);
      };
    },
    []
  );

  const onOnlineUsers = useCallback(
    (handler: (userIds: number[]) => void) => {
      socketRef.current?.on("onlineUsers", handler);
      return () => {
        socketRef.current?.off("onlineUsers", handler);
      };
    },
    []
  );

  const onConversationUpdated = useCallback(
    (
      handler: (data: {
        conversationId: number;
        lastMessage: Message;
      }) => void
    ) => {
      socketRef.current?.on("conversationUpdated", handler);
      return () => {
        socketRef.current?.off("conversationUpdated", handler);
      };
    },
    []
  );

  const onMessageUpdated = useCallback(
    (
      handler: (data: {
        id: number;
        conversationId: number;
        content: string;
        isEdited: boolean;
      }) => void
    ) => {
      socketRef.current?.on("messageUpdated", handler);
      return () => {
        socketRef.current?.off("messageUpdated", handler);
      };
    },
    []
  );

  const onMessageDeleted = useCallback(
    (handler: (data: { id: number; conversationId: number }) => void) => {
      socketRef.current?.on("messageDeleted", handler);
      return () => {
        socketRef.current?.off("messageDeleted", handler);
      };
    },
    []
  );

  const onReactionUpdated = useCallback(
    (handler: (data: { messageId: number; conversationId: number }) => void) => {
      socketRef.current?.on("reactionUpdated", handler);
      return () => {
        socketRef.current?.off("reactionUpdated", handler);
      };
    },
    []
  );

  return {
    socket: socketRef.current,
    join,
    joinConversation,
    leaveConversation,
    sendMessage,
    markAsRead,
    setTyping,
    onNewMessage,
    onMessagesRead,
    onUserTyping,
    onUserOnline,
    onUserOffline,
    onOnlineUsers,
    onConversationUpdated,
    onMessageUpdated,
    onMessageDeleted,
    onReactionUpdated,
  };
}
