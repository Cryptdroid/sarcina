"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  chatApi,
  type ApiChatGroup,
  type ApiGroupInvite,
  type ApiChatMember,
  type ApiChatMessage,
  type ApiChatTask,
  type ApiUserDirectoryEntry,
  inviteApi,
  profileApi,
} from "@/lib/backendApi";
import { useAuth } from "@/lib/AuthContext";
import { firestoreDb } from "@/lib/firebase";
import { collection, onSnapshot } from "firebase/firestore";

const ACTIVE_GROUP_STORAGE_KEY = "SARCINA:teamhub:active-group";

type SharedTask = {
  id: string;
  text: string;
  completed: boolean;
  tag: string;
  assignee?: string;
  priority?: "Low" | "Medium" | "High";
  dueDate?: string;
};

type ChatMessage = {
  id: string;
  author: string;
  text: string;
  time: string;
};

function toChatMessage(message: ApiChatMessage): ChatMessage {
  return {
    id: message.id,
    author: message.author,
    text: message.text,
    time: message.time,
  };
}

function toSharedTask(task: ApiChatTask): SharedTask {
  return {
    id: task.id,
    text: task.text,
    completed: task.completed,
    tag: task.tag,
    assignee: task.assignee,
    priority: task.priority,
    dueDate: task.dueDate,
  };
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function TeamChat() {
  const { user, loading } = useAuth();
  const listRef = useRef<HTMLDivElement | null>(null);

  const [groups, setGroups] = useState<ApiChatGroup[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [members, setMembers] = useState<ApiChatMember[]>([]);
  const [sharedTasks, setSharedTasks] = useState<SharedTask[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const [newGroupName, setNewGroupName] = useState("");
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [inviteQuery, setInviteQuery] = useState("");
  const [inviteResults, setInviteResults] = useState<ApiUserDirectoryEntry[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [incomingInvites, setIncomingInvites] = useState<ApiGroupInvite[]>([]);
  const [inviteActionLoadingId, setInviteActionLoadingId] = useState<string | null>(null);
  const [newTaskText, setNewTaskText] = useState("");
  const [newTaskTag, setNewTaskTag] = useState("General");
  const [newTaskAssignee, setNewTaskAssignee] = useState("Unassigned");
  const [newTaskPriority, setNewTaskPriority] = useState<"Low" | "Medium" | "High">("Medium");
  const [newTaskDueDate, setNewTaskDueDate] = useState("");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [loadingGroupData, setLoadingGroupData] = useState(false);

  const readStoredActiveGroup = () => {
    if (typeof window === "undefined") {
      return null;
    }
    return window.localStorage.getItem(ACTIVE_GROUP_STORAGE_KEY);
  };

  const writeStoredActiveGroup = (groupId: string | null) => {
    if (typeof window === "undefined") {
      return;
    }
    if (!groupId) {
      window.localStorage.removeItem(ACTIVE_GROUP_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(ACTIVE_GROUP_STORAGE_KEY, groupId);
  };

  const activeGroup = useMemo(
    () => groups.find((group) => group.id === activeGroupId) ?? null,
    [activeGroupId, groups]
  );

  const loadGroups = async (preferredGroupId?: string | null) => {
    setLoadingGroups(true);
    try {
      let existing = await chatApi.listGroups();
      if (existing.length === 0) {
        const fallback = await chatApi.createGroup({ name: "General" });
        existing = [fallback];

        try {
          await chatApi.addMember(fallback.id, {
            name: user?.displayName || user?.email || "Owner",
            email: user?.email || undefined,
            role: "owner",
          });
        } catch {
          // Group creation should still succeed even if owner profile insert fails.
        }
      }

      setGroups(existing);

      const storedGroupId = readStoredActiveGroup();
      const preferredCandidate = preferredGroupId ?? storedGroupId;
      const preferred = preferredCandidate && existing.some((group) => group.id === preferredCandidate)
        ? preferredCandidate
        : null;
      const resolved = preferred ?? existing[0].id;
      setActiveGroupId(resolved);
      writeStoredActiveGroup(resolved);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load chat groups.";
      setError(message);
    } finally {
      setLoadingGroups(false);
    }
  };

  const loadActiveGroupData = async (groupId: string) => {
    setLoadingGroupData(true);
    try {
      const [incomingMembers, incomingMessages, incomingTasks] = await Promise.all([
        chatApi.listMembers(groupId),
        chatApi.listMessages(groupId),
        chatApi.listTasks(groupId),
      ]);
      setMembers(incomingMembers);
      setMessages(incomingMessages.map(toChatMessage));
      setSharedTasks(incomingTasks.map(toSharedTask));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load group data.";
      setError(message);
    } finally {
      setLoadingGroupData(false);
    }
  };

  const loadIncomingInvites = async () => {
    try {
      const invites = await inviteApi.listIncoming();
      setIncomingInvites(invites);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load invites.";
      setError(message);
    }
  };

  useEffect(() => {
    if (loading) {
      return;
    }

    if (!user) {
      setGroups([]);
      setActiveGroupId(null);
      setMembers([]);
      setMessages([]);
      setSharedTasks([]);
      setIncomingInvites([]);
      writeStoredActiveGroup(null);
      return;
    }

    void profileApi.upsertCurrentUserProfile();
    void loadGroups(activeGroupId);
    void loadIncomingInvites();
  }, [loading, user]);

  useEffect(() => {
    if (!user?.uid) {
      return;
    }

    const groupsRef = collection(firestoreDb, "users", user.uid, "chatGroups");
    const unsubscribe = onSnapshot(groupsRef, (snapshot) => {
      const nextGroups = snapshot.docs
        .map((docSnap) => {
          const raw = docSnap.data() as Record<string, unknown>;
          return {
            id: docSnap.id,
            name: String(raw.name ?? "Untitled Group"),
            createdAt: String(raw.createdAt ?? ""),
          } as ApiChatGroup;
        })
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

      setGroups(nextGroups);
      if (nextGroups.length === 0) {
        setActiveGroupId(null);
        writeStoredActiveGroup(null);
        return;
      }

      setActiveGroupId((prev) => {
        const preferred = prev && nextGroups.some((group) => group.id === prev) ? prev : nextGroups[0].id;
        writeStoredActiveGroup(preferred);
        return preferred;
      });
    });

    return () => unsubscribe();
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) {
      return;
    }

    const invitesRef = collection(firestoreDb, "users", user.uid, "groupInvites");
    const unsubscribe = onSnapshot(invitesRef, (snapshot) => {
      const invites = snapshot.docs
        .map((docSnap) => {
          const raw = docSnap.data() as Record<string, unknown>;
          return {
            id: docSnap.id,
            groupId: String(raw.groupId ?? ""),
            groupName: String(raw.groupName ?? "Group"),
            fromUserId: String(raw.fromUserId ?? ""),
            fromName: String(raw.fromName ?? "User"),
            fromEmail: typeof raw.fromEmail === "string" ? raw.fromEmail : undefined,
            toUserId: String(raw.toUserId ?? ""),
            toName: String(raw.toName ?? "User"),
            toEmail: typeof raw.toEmail === "string" ? raw.toEmail : undefined,
            status: raw.status === "accepted" || raw.status === "declined" ? raw.status : "pending",
            createdAt: String(raw.createdAt ?? ""),
          } as ApiGroupInvite;
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      setIncomingInvites(invites);
    });

    return () => unsubscribe();
  }, [user?.uid]);

  useEffect(() => {
    if (!activeGroupId) {
      return;
    }

    writeStoredActiveGroup(activeGroupId);
    void loadActiveGroupData(activeGroupId);
  }, [activeGroupId]);

  useEffect(() => {
    if (!activeGroupId) {
      return;
    }

    const membersRef = collection(firestoreDb, "teamGroups", activeGroupId, "members");
    const messagesRef = collection(firestoreDb, "teamGroups", activeGroupId, "messages");
    const tasksRef = collection(firestoreDb, "teamGroups", activeGroupId, "tasks");

    const unsubMembers = onSnapshot(membersRef, async (snapshot) => {
      if (snapshot.docs.length === 0) {
        const fallback = await chatApi.listMembers(activeGroupId);
        setMembers(fallback);
        return;
      }

      const nextMembers = snapshot.docs
        .map((docSnap) => {
          const raw = docSnap.data() as Record<string, unknown>;
          return {
            id: docSnap.id,
            name: String(raw.name ?? "Member"),
            email: typeof raw.email === "string" ? raw.email : undefined,
            role: String(raw.role ?? "member"),
          } as ApiChatMember;
        })
        .sort((a, b) => a.name.localeCompare(b.name));
      setMembers(nextMembers);
    });

    const unsubMessages = onSnapshot(messagesRef, async (snapshot) => {
      if (snapshot.docs.length === 0) {
        const fallback = await chatApi.listMessages(activeGroupId);
        setMessages(fallback.map(toChatMessage));
        return;
      }

      const nextMessages = snapshot.docs
        .map((docSnap) => {
          const raw = docSnap.data() as Record<string, unknown>;
          return {
            id: docSnap.id,
            author: String(raw.author ?? "You"),
            text: String(raw.text ?? ""),
            time: String(raw.time ?? raw.createdAt ?? new Date().toISOString()),
          } as ChatMessage;
        })
        .sort((a, b) => a.time.localeCompare(b.time));
      setMessages(nextMessages);
    });

    const unsubTasks = onSnapshot(tasksRef, async (snapshot) => {
      if (snapshot.docs.length === 0) {
        const fallback = await chatApi.listTasks(activeGroupId);
        setSharedTasks(fallback.map(toSharedTask));
        return;
      }

      const nextTasks = snapshot.docs
        .map((docSnap) => {
          const raw = docSnap.data() as Record<string, unknown>;
          return {
            id: docSnap.id,
            text: String(raw.text ?? ""),
            completed: Boolean(raw.completed ?? false),
            tag: String(raw.tag ?? "General"),
            assignee: typeof raw.assignee === "string" ? raw.assignee : undefined,
            priority:
              raw.priority === "Low" || raw.priority === "Medium" || raw.priority === "High"
                ? raw.priority
                : undefined,
            dueDate: typeof raw.dueDate === "string" ? raw.dueDate : undefined,
          } as SharedTask;
        })
        .sort((a, b) => a.text.localeCompare(b.text));
      setSharedTasks(nextTasks);
    });

    return () => {
      unsubMembers();
      unsubMessages();
      unsubTasks();
    };
  }, [activeGroupId]);

  useEffect(() => {
    if (!listRef.current) {
      return;
    }
    listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const createGroup = async () => {
    const trimmed = newGroupName.trim();
    if (!trimmed) {
      return;
    }

    try {
      setError(null);
      const created = await chatApi.createGroup({ name: trimmed });
      try {
        await chatApi.addMember(created.id, {
          name: user?.displayName || user?.email || "Owner",
          email: user?.email || undefined,
          role: "owner",
        });
      } catch {
        // Do not block group creation when owner metadata write fails.
      }
      await loadGroups(created.id);
      await loadActiveGroupData(created.id);
      setNewGroupName("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not create group.";
      setError(message);
    }
  };

  const removeGroup = async (groupId: string) => {
    if (!window.confirm("Delete this group? Members, messages, and shared tasks will no longer be visible.")) {
      return;
    }

    try {
      setError(null);
      await chatApi.removeGroup(groupId);
      await loadGroups();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not delete group.";
      setError(message);
    }
  };

  const addMember = async () => {
    if (!activeGroupId) {
      return;
    }

    const trimmedName = newMemberName.trim();
    if (!trimmedName) {
      return;
    }

    try {
      setError(null);
      const created = await chatApi.addMember(activeGroupId, {
        name: trimmedName,
        email: newMemberEmail.trim() || undefined,
        role: "member",
      });
      setMembers((prev) => [...prev, created]);
      setNewMemberName("");
      setNewMemberEmail("");
      await loadActiveGroupData(activeGroupId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not add member.";
      setError(message);
    }
  };

  const removeMember = async (memberId: string) => {
    if (!activeGroupId) {
      return;
    }

    const snapshot = members;
    setMembers((prev) => prev.filter((member) => member.id !== memberId));

    try {
      setError(null);
      await chatApi.removeMember(activeGroupId, memberId);
      await loadActiveGroupData(activeGroupId);
    } catch (error) {
      setMembers(snapshot);
      const message = error instanceof Error ? error.message : "Could not remove member.";
      setError(message);
    }
  };

  const searchUsersForInvite = async () => {
    const trimmed = inviteQuery.trim();
    if (!trimmed) {
      setInviteResults([]);
      return;
    }

    setSearchingUsers(true);
    try {
      setError(null);
      const users = await profileApi.searchUsers(trimmed);
      setInviteResults(users);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not search users.";
      setError(message);
    } finally {
      setSearchingUsers(false);
    }
  };

  const inviteByEmail = async () => {
    if (!activeGroupId || !activeGroup) {
      return;
    }

    const email = inviteQuery.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      setError("Enter a valid email to invite.");
      return;
    }

    setInviteActionLoadingId(email);
    try {
      setError(null);
      const target = await profileApi.resolveUserByEmail(email);
      if (!target) {
        setError("No user found with this email. Ask them to log in once so they appear in directory.");
        return;
      }

      const alreadyMember = members.some(
        (member) =>
          (target.email && member.email && member.email.toLowerCase() === target.email.toLowerCase()) ||
          member.name.toLowerCase() === target.name.toLowerCase()
      );
      if (alreadyMember) {
        setError(`${target.name} is already in this group.`);
        return;
      }

      await inviteApi.send({
        groupId: activeGroupId,
        groupName: activeGroup.name,
        targetUserId: target.uid,
        targetName: target.name,
        targetEmail: target.email,
      });
      setInviteQuery("");
      setInviteResults([]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not send email invite.";
      setError(message);
    } finally {
      setInviteActionLoadingId(null);
    }
  };

  const sendInvite = async (target: ApiUserDirectoryEntry) => {
    if (!activeGroupId || !activeGroup) {
      return;
    }

    const alreadyMember = members.some(
      (member) =>
        (target.email && member.email && member.email.toLowerCase() === target.email.toLowerCase()) ||
        member.name.toLowerCase() === target.name.toLowerCase()
    );
    if (alreadyMember) {
      setError(`${target.name} is already in this group.`);
      return;
    }

    setInviteActionLoadingId(target.uid);
    try {
      setError(null);
      await inviteApi.send({
        groupId: activeGroupId,
        groupName: activeGroup.name,
        targetUserId: target.uid,
        targetName: target.name,
        targetEmail: target.email,
      });
      setInviteQuery("");
      setInviteResults([]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not send invite.";
      setError(message);
    } finally {
      setInviteActionLoadingId(null);
    }
  };

  const acceptInvite = async (inviteId: string) => {
    setInviteActionLoadingId(inviteId);
    try {
      setError(null);
      const result = await inviteApi.accept(inviteId);
      await loadIncomingInvites();
      await loadGroups(result.invite.groupId);
      await loadActiveGroupData(result.invite.groupId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not accept invite.";
      setError(message);
    } finally {
      setInviteActionLoadingId(null);
    }
  };

  const declineInvite = async (inviteId: string) => {
    setInviteActionLoadingId(inviteId);
    try {
      setError(null);
      await inviteApi.decline(inviteId);
      await loadIncomingInvites();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not decline invite.";
      setError(message);
    } finally {
      setInviteActionLoadingId(null);
    }
  };

  const addTask = async () => {
    if (!activeGroupId) {
      return;
    }

    const trimmed = newTaskText.trim();
    if (!trimmed) {
      return;
    }

    const optimistic: SharedTask = {
      id: `optimistic-${Date.now()}`,
      text: trimmed,
      completed: false,
      tag: newTaskTag.trim() || "General",
      assignee: newTaskAssignee === "Unassigned" ? undefined : newTaskAssignee,
      priority: newTaskPriority,
      dueDate: newTaskDueDate || undefined,
    };

    setSharedTasks((prev) => [...prev, optimistic]);
    setNewTaskText("");

    try {
      setError(null);
      const created = await chatApi.createTask(activeGroupId, {
        text: optimistic.text,
        tag: optimistic.tag,
        assignee: optimistic.assignee,
        priority: optimistic.priority,
        dueDate: optimistic.dueDate,
      });
      setSharedTasks((prev) => prev.map((task) => (task.id === optimistic.id ? toSharedTask(created) : task)));
      setNewTaskDueDate("");
      setNewTaskPriority("Medium");
      await loadActiveGroupData(activeGroupId);
    } catch (error) {
      setSharedTasks((prev) => prev.filter((task) => task.id !== optimistic.id));
      const message = error instanceof Error ? error.message : "Could not create task.";
      setError(message);
    }
  };

  const toggleTask = async (taskId: string) => {
    if (!activeGroupId) {
      return;
    }

    const snapshot = sharedTasks;
    const optimistic = sharedTasks.map((task) =>
      task.id === taskId ? { ...task, completed: !task.completed } : task
    );
    setSharedTasks(optimistic);

    try {
      setError(null);
      const target = optimistic.find((task) => task.id === taskId);
      if (target) {
        await chatApi.patchTask(activeGroupId, taskId, { completed: target.completed });
      }
      await loadActiveGroupData(activeGroupId);
    } catch (error) {
      setSharedTasks(snapshot);
      const message = error instanceof Error ? error.message : "Could not update task status.";
      setError(message);
    }
  };

  const assignTask = async (taskId: string, assignee: string) => {
    if (!activeGroupId) {
      return;
    }

    const snapshot = sharedTasks;
    const nextAssignee = assignee === "Unassigned" ? undefined : assignee;
    setSharedTasks((prev) => prev.map((task) => (task.id === taskId ? { ...task, assignee: nextAssignee } : task)));

    try {
      setError(null);
      await chatApi.patchTask(activeGroupId, taskId, { assignee: nextAssignee });
      await loadActiveGroupData(activeGroupId);
    } catch (error) {
      setSharedTasks(snapshot);
      const message = error instanceof Error ? error.message : "Could not assign task.";
      setError(message);
    }
  };

  const deleteTask = async (taskId: string) => {
    if (!activeGroupId) {
      return;
    }

    const snapshot = sharedTasks;
    setSharedTasks((prev) => prev.filter((task) => task.id !== taskId));

    try {
      setError(null);
      await chatApi.removeTask(activeGroupId, taskId);
    } catch (error) {
      setSharedTasks(snapshot);
      const message = error instanceof Error ? error.message : "Could not delete task.";
      setError(message);
    }
  };

  const sendMessage = async () => {
    if (!activeGroupId) {
      return;
    }

    const trimmed = draft.trim();
    if (!trimmed) {
      return;
    }

    const author = user?.displayName || user?.email || "You";
    const optimistic: ChatMessage = {
      id: `optimistic-${Date.now()}`,
      author,
      text: trimmed,
      time: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimistic]);
    setDraft("");

    try {
      setError(null);
      const created = await chatApi.createMessage(activeGroupId, {
        author,
        text: trimmed,
      });
      setMessages((prev) => prev.map((message) => (message.id === optimistic.id ? toChatMessage(created) : message)));
      await loadActiveGroupData(activeGroupId);
    } catch (error) {
      setMessages((prev) => prev.filter((message) => message.id !== optimistic.id));
      const message = error instanceof Error ? error.message : "Could not send message.";
      setError(message);
    }
  };

  return (
    <div className="p-4 md:p-8 w-full h-[calc(100dvh-4rem)] md:h-dvh flex flex-col overflow-y-auto overflow-x-hidden relative z-10 pb-24 md:pb-8">
      <header className="mb-6 animate-fade-in-up shrink-0 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-3xl font-bold font-heading text-foreground tracking-tight">Team Flow</h2>
          <p className="text-(--foreground-muted) text-sm mt-2">Create groups, add people, chat, and assign tasks in one place.</p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newGroupName}
            onChange={(event) => setNewGroupName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void createGroup();
              }
            }}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
            placeholder="New group name"
          />
          <button
            type="button"
            onClick={() => void createGroup()}
            className="rounded-lg bg-electric-blue/20 text-electric-blue px-3 py-2 text-sm font-semibold hover:bg-electric-blue/30"
          >
            Create Group
          </button>
          <button
            type="button"
            onClick={() => void loadGroups(activeGroupId)}
            className="rounded-lg bg-white/10 text-foreground px-3 py-2 text-sm font-semibold hover:bg-white/20"
          >
            Refresh
          </button>
        </div>
      </header>

      {error ? <p className="mb-4 text-sm text-rose-300">{error}</p> : null}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full flex-1 min-h-0 relative z-10">
        <section className="lg:col-span-4 flex flex-col gap-4 h-full">
          <div className="glass-card p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-(--foreground-muted) mb-2">Groups</p>
            <div className="space-y-2">
              {loadingGroups ? <p className="text-xs text-(--foreground-muted)">Loading groups...</p> : null}
              {!loadingGroups && groups.length === 0 ? (
                <p className="text-xs text-(--foreground-muted)">No groups yet. Create one to start collaborating.</p>
              ) : null}
              {groups.map((group) => (
                <div key={group.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveGroupId(group.id)}
                    className={`flex-1 text-left rounded-lg px-3 py-2 text-sm transition-colors ${
                      activeGroupId === group.id ? "bg-electric-blue/20 text-electric-blue" : "bg-white/5 hover:bg-white/10"
                    }`}
                  >
                    {group.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => void removeGroup(group.id)}
                    className="rounded-lg border border-rose-300/30 px-2 py-2 text-[11px] text-rose-300 hover:bg-rose-300/10"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-card p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-(--foreground-muted) mb-2">Invites</p>
            <div className="space-y-2">
              {incomingInvites.filter((invite) => invite.status === "pending").length === 0 ? (
                <p className="text-xs text-(--foreground-muted)">No pending invites.</p>
              ) : (
                incomingInvites
                  .filter((invite) => invite.status === "pending")
                  .map((invite) => (
                    <div key={invite.id} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                      <p className="text-sm text-foreground">{invite.groupName}</p>
                      <p className="text-[11px] text-(--foreground-muted)">Invited by {invite.fromName}</p>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => void acceptInvite(invite.id)}
                          disabled={inviteActionLoadingId === invite.id}
                          className="rounded-md bg-electric-blue/20 text-electric-blue px-2 py-1 text-[11px] hover:bg-electric-blue/30 disabled:opacity-60"
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          onClick={() => void declineInvite(invite.id)}
                          disabled={inviteActionLoadingId === invite.id}
                          className="rounded-md border border-rose-300/30 px-2 py-1 text-[11px] text-rose-300 hover:bg-rose-300/10 disabled:opacity-60"
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>

          <div className="glass-card p-4 flex-1 min-h-60">
            <p className="text-xs uppercase tracking-[0.18em] text-(--foreground-muted) mb-2">Members</p>
            <div className="space-y-2 mb-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inviteQuery}
                  onChange={(event) => setInviteQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void searchUsersForInvite();
                    }
                  }}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs"
                  placeholder="Search name or email to invite"
                />
                <button
                  type="button"
                  onClick={() => void searchUsersForInvite()}
                  className="rounded-lg bg-white/10 px-3 py-2 text-xs hover:bg-white/20"
                >
                  Search
                </button>
                <button
                  type="button"
                  onClick={() => void inviteByEmail()}
                  disabled={!activeGroupId || inviteActionLoadingId === inviteQuery.trim().toLowerCase()}
                  className="rounded-lg bg-electric-blue/20 text-electric-blue px-3 py-2 text-xs hover:bg-electric-blue/30 disabled:opacity-60"
                >
                  Invite Email
                </button>
              </div>

              {searchingUsers ? <p className="text-[11px] text-(--foreground-muted)">Searching users...</p> : null}
              {!searchingUsers && inviteQuery.trim() && inviteResults.length === 0 ? (
                <p className="text-[11px] text-(--foreground-muted)">No users found.</p>
              ) : null}

              {inviteResults.map((entry) => (
                <div key={entry.uid} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm text-foreground">{entry.name}</p>
                    <p className="text-[11px] text-(--foreground-muted)">{entry.email ?? "No email"}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void sendInvite(entry)}
                    disabled={!activeGroupId || inviteActionLoadingId === entry.uid}
                    className="rounded-md bg-electric-blue/20 text-electric-blue px-2 py-1 text-[11px] hover:bg-electric-blue/30 disabled:opacity-60"
                  >
                    Invite
                  </button>
                </div>
              ))}
            </div>

            <p className="text-[11px] uppercase tracking-[0.14em] text-(--foreground-muted) mb-2">Quick Add (manual)</p>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={newMemberName}
                onChange={(event) => setNewMemberName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void addMember();
                  }
                }}
                className="w-1/2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs"
                placeholder="Name"
              />
              <input
                type="text"
                value={newMemberEmail}
                onChange={(event) => setNewMemberEmail(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void addMember();
                  }
                }}
                className="w-1/2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs"
                placeholder="Email (optional)"
              />
            </div>
            <button
              type="button"
              onClick={() => void addMember()}
              disabled={!activeGroupId}
              className="mb-3 rounded-lg bg-white/10 px-3 py-2 text-xs hover:bg-white/20 disabled:opacity-40"
            >
              Add Member
            </button>

            <div className="space-y-2">
              {members.length === 0 ? (
                <p className="text-xs text-(--foreground-muted)">No members yet.</p>
              ) : (
                members.map((member) => (
                  <div key={member.id} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm text-foreground">{member.name}</p>
                      <p className="text-[11px] text-(--foreground-muted)">{member.email ?? member.role}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void removeMember(member.id)}
                      className="text-xs text-rose-300 hover:text-rose-200"
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="glass-card p-4 flex-1 min-h-72 overflow-hidden flex flex-col">
            <p className="text-xs uppercase tracking-[0.18em] text-(--foreground-muted) mb-2">Shared Tasks</p>
            <div className="space-y-2 mb-3">
              <input
                type="text"
                value={newTaskText}
                onChange={(event) => setNewTaskText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void addTask();
                  }
                }}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs"
                placeholder="Task title"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={newTaskTag}
                  onChange={(event) => setNewTaskTag(event.target.value)}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs"
                  placeholder="Tag"
                />
                <select
                  value={newTaskAssignee}
                  onChange={(event) => setNewTaskAssignee(event.target.value)}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs"
                >
                  <option>Unassigned</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.name}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={newTaskPriority}
                  onChange={(event) => setNewTaskPriority(event.target.value as "Low" | "Medium" | "High")}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs"
                >
                  <option value="Low">Low priority</option>
                  <option value="Medium">Medium priority</option>
                  <option value="High">High priority</option>
                </select>
                <input
                  type="date"
                  value={newTaskDueDate}
                  onChange={(event) => setNewTaskDueDate(event.target.value)}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => void addTask()}
              disabled={!activeGroupId}
              className="mb-3 rounded-lg bg-white/10 px-3 py-2 text-xs hover:bg-white/20 disabled:opacity-40"
            >
              Create Task
            </button>

            <div className="space-y-2 overflow-y-auto pr-1">
              {sharedTasks.length === 0 ? (
                <p className="text-xs text-(--foreground-muted)">No shared tasks yet.</p>
              ) : null}
              {sharedTasks.map((task) => (
                <div key={task.id} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={task.completed}
                      onChange={() => void toggleTask(task.id)}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <p className={`text-sm ${task.completed ? "line-through text-white/50" : "text-foreground"}`}>{task.text}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-[10px] rounded bg-electric-blue/20 px-2 py-0.5 text-electric-blue">{task.tag}</span>
                        <span className={`text-[10px] rounded px-2 py-0.5 ${task.priority === "High" ? "bg-rose-500/20 text-rose-300" : task.priority === "Low" ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-200"}`}>
                          {task.priority ?? "Medium"}
                        </span>
                        {task.dueDate ? <span className="text-[10px] rounded bg-white/10 px-2 py-0.5 text-(--foreground-muted)">{task.dueDate}</span> : null}
                        <select
                          value={task.assignee ?? "Unassigned"}
                          onChange={(event) => void assignTask(task.id, event.target.value)}
                          className="text-[11px] rounded border border-white/10 bg-white/5 px-2 py-1"
                        >
                          <option>Unassigned</option>
                          {members.map((member) => (
                            <option key={member.id} value={member.name}>
                              {member.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => void deleteTask(task.id)}
                          className="text-[10px] rounded border border-rose-300/30 px-2 py-0.5 text-rose-300 hover:bg-rose-300/10"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="lg:col-span-8 glass-card flex flex-col overflow-hidden min-h-125">
          <div className="h-16 border-b border-(--glass-border) flex items-center justify-between px-6 bg-white/5">
            <div className="flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-electric-blue shadow-[0_0_8px_var(--accent-electric-blue)]"></span>
              <h3 className="text-lg font-heading font-bold text-foreground"># {activeGroup?.name ?? "Group Chat"}</h3>
            </div>
            <span className="text-xs text-(--foreground-muted)">{members.length} members</span>
          </div>

          <div ref={listRef} className="flex-1 overflow-y-auto p-6 space-y-4 flex flex-col">
            {loadingGroupData ? <p className="text-sm text-(--foreground-muted)">Loading conversation...</p> : null}
            {messages.length === 0 ? (
              <p className="text-sm text-(--foreground-muted)">No messages yet. Start the conversation.</p>
            ) : (
              messages.map((message) => {
                const mine = message.author === (user?.displayName || user?.email || "You");
                return mine ? (
                  <div key={message.id} className="self-end max-w-[85%]">
                    <div className="bg-linear-to-r from-electric-blue to-neon-purple p-px rounded-xl rounded-tr-none">
                      <div className="bg-panel rounded-xl rounded-tr-none p-3">
                        <p className="text-sm text-foreground leading-relaxed">{message.text}</p>
                      </div>
                    </div>
                    <span className="text-[10px] text-(--foreground-muted) mt-1 block text-right">{formatTime(message.time)}</span>
                  </div>
                ) : (
                  <div key={message.id} className="max-w-[85%] rounded-lg border border-white/10 bg-white/5 p-3">
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="font-semibold text-sm text-foreground">{message.author}</span>
                      <span className="text-[10px] text-(--foreground-muted)">{formatTime(message.time)}</span>
                    </div>
                    <p className="text-sm text-foreground/90">{message.text}</p>
                  </div>
                );
              })
            )}
          </div>

          <div className="p-4 bg-black/20 border-t border-(--glass-border)">
            <div className="relative">
              <input
                type="text"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void sendMessage();
                  }
                }}
                className="w-full bg-background border border-(--glass-border) rounded-full px-5 py-3 pr-12 text-sm text-foreground placeholder-(--foreground-muted)"
                placeholder="Message group..."
              />
              <button
                type="button"
                onClick={() => void sendMessage()}
                disabled={!activeGroupId}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/10 rounded-full flex items-center justify-center hover:bg-electric-blue hover:text-black transition-colors text-foreground disabled:opacity-40"
              >
                <svg className="w-4 h-4 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
