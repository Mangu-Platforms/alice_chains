import { useState } from "react";
import { useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { MIN_USER_SEARCH_LENGTH } from "@contracts/constants";
import {
  ArrowLeft,
  Search,
  UserPlus,
  Users,
  UserCheck,
  Clock,
  MessageCircle,
  X,
  Check,
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export default function Contacts() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [searchUserQuery, setSearchUserQuery] = useState("");

  const utils = trpc.useUtils();

  const { data: contacts, refetch: refetchContacts } =
    trpc.contact.list.useQuery();
  const { data: pendingRequests, refetch: refetchPending } =
    trpc.contact.pending.useQuery();

  // S-10 raised the server-side minimum to MIN_USER_SEARCH_LENGTH characters,
  // so the query stays disabled below it rather than firing a request the
  // server will reject.
  const trimmedUserQuery = searchUserQuery.trim();
  const userQueryIsSearchable = trimmedUserQuery.length >= MIN_USER_SEARCH_LENGTH;
  const searchUsersQuery = trpc.contact.searchUsers.useQuery(
    { query: trimmedUserQuery },
    { enabled: userQueryIsSearchable }
  );

  const addContactMutation = trpc.contact.add.useMutation({
    onSuccess: () => {
      toast.success("Contact request sent");
      setSearchUserQuery("");
      refetchPending();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const acceptContactMutation = trpc.contact.accept.useMutation({
    onSuccess: () => {
      toast.success("Contact request accepted");
      refetchContacts();
      refetchPending();
    },
  });

  const removeContactMutation = trpc.contact.remove.useMutation({
    onSuccess: () => {
      toast.success("Contact removed");
      refetchContacts();
    },
  });

  const createDirectMutation = trpc.conversation.createDirect.useMutation({
    onSuccess: (data: { id?: number }) => {
      if (data && typeof data === "object" && "id" in data && data.id) {
        navigate(`/?c=${data.id}`);
      } else {
        // Refetch conversations and navigate
        utils.conversation.list.invalidate();
        toast.success("Conversation created");
      }
    },
  });

  const handleStartChat = (contactUserId: number) => {
    createDirectMutation.mutate({ otherUserId: contactUserId });
  };

  return (
    <div className="h-screen w-full bg-background flex flex-col">
      {/* Header */}
      <header className="flex items-center gap-4 px-4 py-3 border-b border-border bg-card/30">
        <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-3 flex-1">
          <Users className="w-5 h-5 text-primary" />
          <h1 className="font-bold text-lg">Contacts</h1>
        </div>
        <Dialog open={addContactOpen} onOpenChange={setAddContactOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <UserPlus className="w-4 h-4" />
              Add Contact
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add a Contact</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or email..."
                  aria-label="Search for a user by name or email address"
                  className="pl-9"
                  value={searchUserQuery}
                  onChange={(e) => setSearchUserQuery(e.target.value)}
                  autoFocus
                />
              </div>
              <ScrollArea className="h-72">
                <div className="space-y-2">
                  {searchUsersQuery.data?.map((foundUser) => {
                    const isContact = contacts?.some(
                      (c) => c.contactUserId === foundUser.id
                    );
                    return (
                      <div
                        key={foundUser.id}
                        className="flex items-center gap-3 p-3 rounded-lg border border-border/50 hover:bg-secondary/50 transition-colors"
                      >
                        <Avatar className="w-10 h-10">
                          <AvatarImage src={foundUser.avatar || undefined} />
                          <AvatarFallback className="bg-primary/20 text-primary text-sm">
                            {foundUser.name?.charAt(0).toUpperCase() || "?"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">
                            {foundUser.name}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {isContact ? "Already a contact" : "Not in your contacts"}
                          </p>
                        </div>
                        {isContact ? (
                          <Button variant="ghost" size="sm" disabled>
                            <UserCheck className="w-4 h-4" />
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() =>
                              addContactMutation.mutate({
                                contactUserId: foundUser.id,
                              })
                            }
                            disabled={addContactMutation.isPending}
                          >
                            <UserPlus className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    );
                  })}

                  {userQueryIsSearchable && searchUsersQuery.isPending && (
                    <div className="text-center py-8 text-muted-foreground">
                      <Spinner className="w-6 h-6 mx-auto mb-3" />
                      <p className="text-sm">Searching…</p>
                    </div>
                  )}

                  {userQueryIsSearchable && searchUsersQuery.isError && (
                    <div className="text-center py-8 text-muted-foreground">
                      <Search className="w-10 h-10 mx-auto mb-3 opacity-40" />
                      <p className="text-sm">{searchUsersQuery.error.message}</p>
                    </div>
                  )}

                  {userQueryIsSearchable &&
                    searchUsersQuery.isSuccess &&
                    searchUsersQuery.data.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        <Search className="w-10 h-10 mx-auto mb-3 opacity-40" />
                        <p className="text-sm">No users found</p>
                      </div>
                    )}

                  {!userQueryIsSearchable && (
                    <div className="text-center py-8 text-muted-foreground">
                      <Search className="w-10 h-10 mx-auto mb-3 opacity-40" />
                      <p className="text-sm">
                        Type at least {MIN_USER_SEARCH_LENGTH} characters to search
                      </p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </DialogContent>
        </Dialog>
      </header>

      {/* Content */}
      <Tabs defaultValue="contacts" className="flex-1 flex flex-col">
        <div className="px-4 pt-4">
          <TabsList className="w-full">
            <TabsTrigger value="contacts" className="flex-1 gap-2">
              <Users className="w-4 h-4" />
              My Contacts
              {contacts && contacts.length > 0 && (
                <span className="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">
                  {contacts.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="pending" className="flex-1 gap-2">
              <Clock className="w-4 h-4" />
              Pending
              {pendingRequests && pendingRequests.length > 0 && (
                <span className="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">
                  {pendingRequests.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="contacts" className="flex-1 flex flex-col mt-0">
          <div className="px-4 py-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search contacts..."
                className="pl-9 bg-secondary/50 border-0"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <ScrollArea className="flex-1 px-4">
            <div className="space-y-2 pb-4">
              {contacts
                ?.filter((contact) =>
                  searchQuery
                    ? contact.contactName
                        ?.toLowerCase()
                        .includes(searchQuery.toLowerCase())
                    : true
                )
                .map((contact) => (
                  <div
                    key={contact.id}
                    className="flex items-center gap-3 p-3 rounded-xl border border-border/50 hover:bg-secondary/30 transition-colors group"
                  >
                    <Avatar className="w-12 h-12">
                      <AvatarImage
                        src={contact.contactAvatar || undefined}
                      />
                      <AvatarFallback className="bg-primary/20 text-primary">
                        {contact.contactName?.charAt(0).toUpperCase() || "?"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">
                        {contact.contactName}
                      </p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Mail className="w-3 h-3" />
                        {contact.contactEmail}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9"
                        onClick={() =>
                          handleStartChat(contact.contactUserId)
                        }
                        title="Start chat"
                      >
                        <MessageCircle className="w-4 h-4 text-primary" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9"
                        onClick={() =>
                          removeContactMutation.mutate({
                            contactUserId: contact.contactUserId,
                          })
                        }
                        title="Remove contact"
                      >
                        <X className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}

              {contacts?.length === 0 && (
                <div className="text-center py-16 text-muted-foreground">
                  <Users className="w-16 h-16 mx-auto mb-4 opacity-30" />
                  <p className="text-lg font-medium mb-1">No contacts yet</p>
                  <p className="text-sm mb-4">
                    Add contacts to start messaging
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => setAddContactOpen(true)}
                    className="gap-2"
                  >
                    <UserPlus className="w-4 h-4" />
                    Add Contact
                  </Button>
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="pending" className="flex-1 flex flex-col mt-0">
          <ScrollArea className="flex-1 px-4 pt-4">
            <div className="space-y-2 pb-4">
              {pendingRequests?.map((request) => (
                <div
                  key={request.id}
                  className="flex items-center gap-3 p-4 rounded-xl border border-border/50 bg-card/30"
                >
                  <Avatar className="w-12 h-12">
                    <AvatarImage src={request.contactAvatar || undefined} />
                    <AvatarFallback className="bg-primary/20 text-primary">
                      {request.contactName?.charAt(0).toUpperCase() || "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">
                      {request.contactName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      wants to add you as a contact
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9"
                      onClick={() =>
                        removeContactMutation.mutate({
                          contactUserId: request.userId,
                        })
                      }
                    >
                      <X className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      onClick={() =>
                        acceptContactMutation.mutate({
                          contactId: request.userId,
                        })
                      }
                      className="gap-1"
                    >
                      <Check className="w-4 h-4" />
                      Accept
                    </Button>
                  </div>
                </div>
              ))}

              {pendingRequests?.length === 0 && (
                <div className="text-center py-16 text-muted-foreground">
                  <Clock className="w-16 h-16 mx-auto mb-4 opacity-30" />
                  <p className="text-lg font-medium">No pending requests</p>
                  <p className="text-sm">
                    When someone adds you, requests will appear here
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
