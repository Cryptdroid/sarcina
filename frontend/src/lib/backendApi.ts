import { onAuthStateChanged, type User } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { firebaseAuth, firestoreDb } from "@/lib/firebase";

export interface ApiSubTask {
  id: string;
  text: string;
  completed: boolean;
}

export interface ApiTask {
  id: string;
  text: string;
  completed: boolean;
  subTasks: ApiSubTask[];
  dueDate?: string | null;
  dueTime?: string | null;
}

export interface ApiHabit {
  id: string;
  name: string;
  streak: number;
  lastCompletedDate: string | null;
}

export interface ApiQuickNote {
  id: string;
  text: string;
  savedAt: string | null;
}

export interface ApiChatMessage {
  id: string;
  author: string;
  text: string;
  time: string;
}

export interface ApiChatTask {
  id: string;
  text: string;
  completed: boolean;
  tag: string;
  assignee?: string;
  priority?: "Low" | "Medium" | "High";
  dueDate?: string;
}

export interface ApiChatGroup {
  id: string;
  name: string;
  createdAt: string;
}

export interface ApiChatMember {
  id: string;
  name: string;
  email?: string;
  role: string;
}

export interface ApiUserDirectoryEntry {
  uid: string;
  name: string;
  email?: string;
  emailLower?: string;
  photoURL?: string;
}

export interface ApiGroupInvite {
  id: string;
  groupId: string;
  groupName: string;
  fromUserId: string;
  fromName: string;
  fromEmail?: string;
  toUserId: string;
  toName: string;
  toEmail?: string;
  status: "pending" | "accepted" | "declined";
  createdAt: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

let authBootstrapPromise: Promise<void> | null = null;

function waitForAuthBootstrap(): Promise<void> {
  if (firebaseAuth.currentUser) {
    return Promise.resolve();
  }

  const authWithReady = firebaseAuth as typeof firebaseAuth & {
    authStateReady?: () => Promise<void>;
  };
  if (typeof authWithReady.authStateReady === "function") {
    return authWithReady.authStateReady();
  }

  if (authBootstrapPromise) {
    return authBootstrapPromise;
  }

  authBootstrapPromise = new Promise<void>((resolve) => {
    const timeout = window.setTimeout(() => {
      unsubscribe();
      resolve();
    }, 15000);

    const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
      if (!user) {
        return;
      }
      window.clearTimeout(timeout);
      unsubscribe();
      resolve();
    });
  }).finally(() => {
    authBootstrapPromise = null;
  });

  return authBootstrapPromise;
}

async function getAuthedUser(): Promise<User> {
  if (firebaseAuth.currentUser) {
    return firebaseAuth.currentUser;
  }

  await waitForAuthBootstrap();

  if (firebaseAuth.currentUser) {
    return firebaseAuth.currentUser;
  }

  throw new Error("User is not authenticated");
}

async function userCollection(name: string) {
  const user = await getAuthedUser();
  return collection(firestoreDb, "users", user.uid, name);
}

async function userDoc(collectionName: string, id: string) {
  const user = await getAuthedUser();
  return doc(firestoreDb, "users", user.uid, collectionName, id);
}

async function quickNoteDoc() {
  const user = await getAuthedUser();
  return doc(firestoreDb, "users", user.uid, "notes", "quick");
}

function toApiTask(raw: Record<string, unknown>, id: string): ApiTask {
  return {
    id,
    text: String(raw.text ?? ""),
    completed: Boolean(raw.completed ?? false),
    subTasks: Array.isArray(raw.subTasks) ? (raw.subTasks as ApiSubTask[]) : [],
    dueDate: typeof raw.dueDate === "string" ? raw.dueDate : null,
    dueTime: typeof raw.dueTime === "string" ? raw.dueTime : null,
  };
}

function toApiHabit(raw: Record<string, unknown>, id: string): ApiHabit {
  return {
    id,
    name: String(raw.name ?? ""),
    streak: Number(raw.streak ?? 0),
    lastCompletedDate: typeof raw.lastCompletedDate === "string" ? raw.lastCompletedDate : null,
  };
}

function toApiChatMessage(raw: Record<string, unknown>, id: string): ApiChatMessage {
  return {
    id,
    author: String(raw.author ?? "You"),
    text: String(raw.text ?? ""),
    time: String(raw.time ?? nowIso()),
  };
}

function toApiChatTask(raw: Record<string, unknown>, id: string): ApiChatTask {
  return {
    id,
    text: String(raw.text ?? ""),
    completed: Boolean(raw.completed ?? false),
    tag: String(raw.tag ?? "General"),
    assignee: typeof raw.assignee === "string" ? raw.assignee : undefined,
    priority:
      raw.priority === "Low" || raw.priority === "Medium" || raw.priority === "High"
        ? raw.priority
        : undefined,
    dueDate: typeof raw.dueDate === "string" ? raw.dueDate : undefined,
  };
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  const next = Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  ) as T;
  return next;
}

function toApiChatGroup(raw: Record<string, unknown>, id: string): ApiChatGroup {
  return {
    id,
    name: String(raw.name ?? "Untitled Group"),
    createdAt: String(raw.createdAt ?? nowIso()),
  };
}

function toApiChatMember(raw: Record<string, unknown>, id: string): ApiChatMember {
  return {
    id,
    name: String(raw.name ?? "Member"),
    email: typeof raw.email == "string" ? raw.email : undefined,
    role: String(raw.role ?? "member"),
  };
}

function toApiUserDirectoryEntry(raw: Record<string, unknown>, uid: string): ApiUserDirectoryEntry {
  return {
    uid,
    name: String(raw.name ?? "User"),
    email: typeof raw.email === "string" ? raw.email : undefined,
    emailLower: typeof raw.emailLower === "string" ? raw.emailLower : undefined,
    photoURL: typeof raw.photoURL === "string" ? raw.photoURL : undefined,
  };
}

function toApiGroupInvite(raw: Record<string, unknown>, id: string): ApiGroupInvite {
  return {
    id,
    groupId: String(raw.groupId ?? ""),
    groupName: String(raw.groupName ?? "Group"),
    fromUserId: String(raw.fromUserId ?? ""),
    fromName: String(raw.fromName ?? "User"),
    fromEmail: typeof raw.fromEmail === "string" ? raw.fromEmail : undefined,
    toUserId: String(raw.toUserId ?? ""),
    toName: String(raw.toName ?? "User"),
    toEmail: typeof raw.toEmail === "string" ? raw.toEmail : undefined,
    status: raw.status === "accepted" || raw.status === "declined" ? raw.status : "pending",
    createdAt: String(raw.createdAt ?? nowIso()),
  };
}

async function listByCreatedAt(path: string) {
  const col = await userCollection(path);
  const snaps = await getDocs(col);
  return snaps.docs.sort((a, b) => {
    const at = String(a.data().createdAt ?? "");
    const bt = String(b.data().createdAt ?? "");
    return at.localeCompare(bt);
  });
}

async function chatGroupsCollection() {
  const user = await getAuthedUser()
  return collection(firestoreDb, "users", user.uid, "chatGroups");
}

async function chatGroupDoc(groupId: string) {
  const user = await getAuthedUser();
  return doc(firestoreDb, "users", user.uid, "chatGroups", groupId);
}

async function chatGroupMembersCollection(groupId: string) {
  const user = await getAuthedUser();
  return collection(firestoreDb, "users", user.uid, "chatGroups", groupId, "members");
}

async function chatGroupMemberDoc(groupId: string, memberId: string) {
  const user = await getAuthedUser();
  return doc(firestoreDb, "users", user.uid, "chatGroups", groupId, "members", memberId);
}

async function chatGroupMessagesCollection(groupId: string) {
  const user = await getAuthedUser();
  return collection(firestoreDb, "users", user.uid, "chatGroups", groupId, "messages");
}

async function chatGroupMessageDoc(groupId: string, messageId: string) {
  const user = await getAuthedUser();
  return doc(firestoreDb, "users", user.uid, "chatGroups", groupId, "messages", messageId);
}

async function chatGroupTasksCollection(groupId: string) {
  const user = await getAuthedUser();
  return collection(firestoreDb, "users", user.uid, "chatGroups", groupId, "tasks");
}

async function chatGroupTaskDoc(groupId: string, taskId: string) {
  const user = await getAuthedUser();
  return doc(firestoreDb, "users", user.uid, "chatGroups", groupId, "tasks", taskId);
}

function sharedGroupDoc(groupId: string) {
  return doc(firestoreDb, "teamGroups", groupId);
}

function sharedGroupMembersCollection(groupId: string) {
  return collection(firestoreDb, "teamGroups", groupId, "members");
}

function sharedGroupMemberDoc(groupId: string, memberId: string) {
  return doc(firestoreDb, "teamGroups", groupId, "members", memberId);
}

function sharedGroupMessagesCollection(groupId: string) {
  return collection(firestoreDb, "teamGroups", groupId, "messages");
}

function sharedGroupMessageDoc(groupId: string, messageId: string) {
  return doc(firestoreDb, "teamGroups", groupId, "messages", messageId);
}

function sharedGroupTasksCollection(groupId: string) {
  return collection(firestoreDb, "teamGroups", groupId, "tasks");
}

function sharedGroupTaskDoc(groupId: string, taskId: string) {
  return doc(firestoreDb, "teamGroups", groupId, "tasks", taskId);
}

function directoryDoc(uid: string) {
  return doc(firestoreDb, "userDirectory", uid);
}

function userInviteCollection(uid: string) {
  return collection(firestoreDb, "users", uid, "groupInvites");
}

function userInviteDoc(uid: string, inviteId: string) {
  return doc(firestoreDb, "users", uid, "groupInvites", inviteId);
}

async function chatGroupDocForUser(uid: string, groupId: string) {
  return doc(firestoreDb, "users", uid, "chatGroups", groupId);
}

async function chatGroupMemberDocForUser(uid: string, groupId: string, memberId: string) {
  return doc(firestoreDb, "users", uid, "chatGroups", groupId, "members", memberId);
}

export const taskApi = {
  list: async () => {
    const docs = await listByCreatedAt("tasks");
    return docs.map((snap) => toApiTask(snap.data() as Record<string, unknown>, snap.id));
  },
  create: async (payload: { text: string; dueDate?: string; dueTime?: string }) => {
    const id = crypto.randomUUID();
    const ref = await userDoc("tasks", id);
    const value: ApiTask & { createdAt: string } = {
      id,
      text: payload.text,
      completed: false,
      subTasks: [],
      dueDate: payload.dueDate ?? null,
      dueTime: payload.dueTime ?? null,
      createdAt: nowIso(),
    };
    await setDoc(ref, value);
    return value;
  },
  patch: async (id: string, payload: Partial<ApiTask>) => {
    const ref = await userDoc("tasks", id);
    await updateDoc(ref, { ...payload, updatedAt: nowIso() });
    const next = await getDoc(ref);
    return toApiTask(next.data() as Record<string, unknown>, id);
  },
  remove: async (id: string) => {
    const ref = await userDoc("tasks", id);
    await deleteDoc(ref);
    return { status: "ok" };
  },
};

export const habitApi = {
  list: async () => {
    const docs = await listByCreatedAt("habits");
    return docs.map((snap) => toApiHabit(snap.data() as Record<string, unknown>, snap.id));
  },
  create: async (payload: { name: string }) => {
    const id = crypto.randomUUID();
    const ref = await userDoc("habits", id);
    const value: ApiHabit & { createdAt: string } = {
      id,
      name: payload.name,
      streak: 0,
      lastCompletedDate: null,
      createdAt: nowIso(),
    };
    await setDoc(ref, value);
    return value;
  },
  patch: async (id: string, payload: Partial<ApiHabit>) => {
    const ref = await userDoc("habits", id);
    await updateDoc(ref, { ...payload, updatedAt: nowIso() });
    const next = await getDoc(ref);
    return toApiHabit(next.data() as Record<string, unknown>, id);
  },
  remove: async (id: string) => {
    const ref = await userDoc("habits", id);
    await deleteDoc(ref);
    return { status: "ok" };
  },
};

export const noteApi = {
  getQuick: async () => {
    const ref = await quickNoteDoc();
    const snap = await getDoc(ref);
    const value = snap.exists() ? (snap.data() as Record<string, unknown>) : {};
    return {
      id: "quick",
      text: String(value.text ?? ""),
      savedAt: typeof value.savedAt === "string" ? value.savedAt : null,
    };
  },
  saveQuick: async (payload: { text: string }) => {
    const ref = await quickNoteDoc();
    const value: ApiQuickNote = {
      id: "quick",
      text: payload.text,
      savedAt: nowIso(),
    };
    await setDoc(ref, value, { merge: true });
    return value;
  },
};

export const profileApi = {
  upsertCurrentUserProfile: async () => {
    const user = await getAuthedUser();
    const ref = directoryDoc(user.uid);
    const normalizedEmail = user.email ? user.email.trim().toLowerCase() : null;
    await setDoc(
      ref,
      {
        uid: user.uid,
        name: user.displayName || user.email || "User",
        email: user.email || null,
        emailLower: normalizedEmail,
        photoURL: user.photoURL || null,
        updatedAt: nowIso(),
      },
      { merge: true }
    );
  },
  searchUsers: async (query: string) => {
    const currentUser = await getAuthedUser();
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return [] as ApiUserDirectoryEntry[];
    }

    const snaps = await getDocs(collection(firestoreDb, "userDirectory"));
    const matches = snaps.docs
      .map((snap) => toApiUserDirectoryEntry(snap.data() as Record<string, unknown>, snap.id))
      .filter((entry) => {
        if (entry.uid === currentUser.uid) {
          return false;
        }
        const haystack = `${entry.name} ${entry.email ?? ""}`.toLowerCase();
        return haystack.includes(normalized);
      })
      .slice(0, 8);

    return matches;
  },
  resolveUserByEmail: async (email: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      return null as ApiUserDirectoryEntry | null;
    }

    const currentUser = await getAuthedUser();
    const snaps = await getDocs(collection(firestoreDb, "userDirectory"));
    const entry = snaps.docs
      .map((snap) => toApiUserDirectoryEntry(snap.data() as Record<string, unknown>, snap.id))
      .find((candidate) => {
        if (candidate.uid === currentUser.uid) {
          return false;
        }
        const candidateEmail = (candidate.emailLower || candidate.email || "").trim().toLowerCase();
        return candidateEmail === normalizedEmail;
      });

    return entry ?? null;
  },
};

export const chatApi = {
  listGroups: async () => {
    const col = await chatGroupsCollection();
    const snaps = await getDocs(col);
    const docs = snaps.docs.sort((a, b) => {
      const at = String(a.data().createdAt ?? "");
      const bt = String(b.data().createdAt ?? "");
      return at.localeCompare(bt);
    });
    return docs.map((snap) => toApiChatGroup(snap.data() as Record<string, unknown>, snap.id));
  },
  createGroup: async (payload: { name: string }) => {
    const user = await getAuthedUser();
    const id = crypto.randomUUID();
    const value: ApiChatGroup = {
      id,
      name: payload.name,
      createdAt: nowIso(),
    };

    const [indexRef, ownerMemberRef] = await Promise.all([
      chatGroupDoc(id),
      Promise.resolve(sharedGroupMemberDoc(id, user.uid)),
    ]);

    await Promise.all([
      setDoc(indexRef, value),
      setDoc(sharedGroupDoc(id), { ...value, ownerId: user.uid }, { merge: true }),
      setDoc(ownerMemberRef, {
        id: user.uid,
        name: user.displayName || user.email || "Owner",
        email: user.email || null,
        role: "owner",
      }, { merge: true }),
    ]);

    return value;
  },
  removeGroup: async (groupId: string) => {
    const currentUser = await getAuthedUser();

    const [sharedMembersSnap, sharedMessagesSnap, sharedTasksSnap] = await Promise.all([
      getDocs(sharedGroupMembersCollection(groupId)),
      getDocs(sharedGroupMessagesCollection(groupId)),
      getDocs(sharedGroupTasksCollection(groupId)),
    ]);

    await Promise.all([
      ...sharedMembersSnap.docs.map(async (snap) => {
        await deleteDoc(sharedGroupMemberDoc(groupId, snap.id));
        const userGroupRef = await chatGroupDocForUser(snap.id, groupId);
        await deleteDoc(userGroupRef);
      }),
      ...sharedMessagesSnap.docs.map((snap) => deleteDoc(sharedGroupMessageDoc(groupId, snap.id))),
      ...sharedTasksSnap.docs.map((snap) => deleteDoc(sharedGroupTaskDoc(groupId, snap.id))),
    ]);

    await Promise.all([
      deleteDoc(sharedGroupDoc(groupId)),
      deleteDoc(await chatGroupDocForUser(currentUser.uid, groupId)),
    ]);

    return { status: "ok" };
  },
  listMembers: async (groupId: string) => {
    const sharedSnaps = await getDocs(sharedGroupMembersCollection(groupId));
    if (sharedSnaps.docs.length > 0) {
      return sharedSnaps.docs
        .sort((a, b) => String(a.data().name ?? "").localeCompare(String(b.data().name ?? "")))
        .map((snap) => toApiChatMember(snap.data() as Record<string, unknown>, snap.id));
    }

    const col = await chatGroupMembersCollection(groupId);
    const snaps = await getDocs(col);
    return snaps.docs
      .sort((a, b) => String(a.data().name ?? "").localeCompare(String(b.data().name ?? "")))
      .map((snap) => toApiChatMember(snap.data() as Record<string, unknown>, snap.id));
  },
  addMember: async (groupId: string, payload: { name: string; email?: string; role?: string }) => {
    let id = crypto.randomUUID();
    let normalizedEmail = payload.email?.trim().toLowerCase();

    if (normalizedEmail) {
      const directorySnaps = await getDocs(collection(firestoreDb, "userDirectory"));
      const match = directorySnaps.docs
        .map((snap) => toApiUserDirectoryEntry(snap.data() as Record<string, unknown>, snap.id))
        .find((entry) => (entry.emailLower || entry.email || "").trim().toLowerCase() === normalizedEmail);

      if (match) {
        id = match.uid;
        normalizedEmail = match.email || normalizedEmail;
        const sharedGroup = await getDoc(sharedGroupDoc(groupId));
        const sharedGroupName = sharedGroup.exists()
          ? String((sharedGroup.data() as Record<string, unknown>).name ?? "Shared Group")
          : "Shared Group";
        const userGroupRef = await chatGroupDocForUser(match.uid, groupId);
        await setDoc(userGroupRef, { id: groupId, name: sharedGroupName, createdAt: nowIso() }, { merge: true });
      }
    }

    const ref = sharedGroupMemberDoc(groupId, id);
    const value = stripUndefined({
      id,
      name: payload.name,
      email: normalizedEmail,
      role: payload.role ?? "member",
    });
    await setDoc(ref, value, { merge: true });
    return value as ApiChatMember;
  },
  removeMember: async (groupId: string, memberId: string) => {
    await deleteDoc(sharedGroupMemberDoc(groupId, memberId));
    const userGroupRef = await chatGroupDocForUser(memberId, groupId);
    await deleteDoc(userGroupRef);
    return { status: "ok" };
  },
  listMessages: async (groupId: string) => {
    const sharedSnaps = await getDocs(sharedGroupMessagesCollection(groupId));
    const sharedDocs = sharedSnaps.docs.sort((a, b) => {
      const at = String(a.data().createdAt ?? "");
      const bt = String(b.data().createdAt ?? "");
      return at.localeCompare(bt);
    });

    if (sharedDocs.length > 0) {
      return sharedDocs.map((snap) => toApiChatMessage(snap.data() as Record<string, unknown>, snap.id));
    }

    const col = await chatGroupMessagesCollection(groupId);
    const snaps = await getDocs(col);
    const docs = snaps.docs.sort((a, b) => {
      const at = String(a.data().createdAt ?? "");
      const bt = String(b.data().createdAt ?? "");
      return at.localeCompare(bt);
    });
    return docs.map((snap) => toApiChatMessage(snap.data() as Record<string, unknown>, snap.id));
  },
  createMessage: async (groupId: string, payload: { author: string; text: string }) => {
    const id = crypto.randomUUID();
    const ref = sharedGroupMessageDoc(groupId, id);
    const value: ApiChatMessage & { createdAt: string } = {
      id,
      author: payload.author,
      text: payload.text,
      time: nowIso(),
      createdAt: nowIso(),
    };
    await setDoc(ref, value);
    return value;
  },
  listTasks: async (groupId: string) => {
    const sharedSnaps = await getDocs(sharedGroupTasksCollection(groupId));
    const sharedDocs = sharedSnaps.docs.sort((a, b) => {
      const at = String(a.data().createdAt ?? "");
      const bt = String(b.data().createdAt ?? "");
      return at.localeCompare(bt);
    });

    if (sharedDocs.length > 0) {
      return sharedDocs.map((snap) => toApiChatTask(snap.data() as Record<string, unknown>, snap.id));
    }

    const col = await chatGroupTasksCollection(groupId);
    const snaps = await getDocs(col);
    const docs = snaps.docs.sort((a, b) => {
      const at = String(a.data().createdAt ?? "");
      const bt = String(b.data().createdAt ?? "");
      return at.localeCompare(bt);
    });
    return docs.map((snap) => toApiChatTask(snap.data() as Record<string, unknown>, snap.id));
  },
  createTask: async (groupId: string, payload: { text: string; tag?: string; assignee?: string; priority?: "Low" | "Medium" | "High"; dueDate?: string }) => {
    const id = crypto.randomUUID();
    const ref = sharedGroupTaskDoc(groupId, id);
    const value = stripUndefined({
      id,
      text: payload.text,
      completed: false,
      tag: payload.tag ?? "General",
      assignee: payload.assignee,
      priority: payload.priority,
      dueDate: payload.dueDate,
      createdAt: nowIso(),
    });
    await setDoc(ref, value);
    return value as ApiChatTask & { createdAt: string };
  },
  patchTask: async (groupId: string, id: string, payload: Partial<ApiChatTask>) => {
    const ref = sharedGroupTaskDoc(groupId, id);
    await updateDoc(ref, stripUndefined({ ...payload, updatedAt: nowIso() }));
    const next = await getDoc(ref);
    return toApiChatTask(next.data() as Record<string, unknown>, id);
  },
  removeTask: async (groupId: string, id: string) => {
    const ref = sharedGroupTaskDoc(groupId, id);
    await deleteDoc(ref);
    return { status: "ok" };
  },
};

export const inviteApi = {
  listIncoming: async () => {
    const user = await getAuthedUser();
    const col = userInviteCollection(user.uid);
    const snaps = await getDocs(col);
    return snaps.docs
      .map((snap) => toApiGroupInvite(snap.data() as Record<string, unknown>, snap.id))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  send: async (payload: {
    groupId: string;
    groupName: string;
    targetUserId: string;
    targetName: string;
    targetEmail?: string;
  }) => {
    const sender = await getAuthedUser();
    const inviteId = crypto.randomUUID();
    const invite: ApiGroupInvite = {
      id: inviteId,
      groupId: payload.groupId,
      groupName: payload.groupName,
      fromUserId: sender.uid,
      fromName: sender.displayName || sender.email || "User",
      fromEmail: sender.email || undefined,
      toUserId: payload.targetUserId,
      toName: payload.targetName,
      toEmail: payload.targetEmail,
      status: "pending",
      createdAt: nowIso(),
    };

    const ref = userInviteDoc(payload.targetUserId, inviteId);
    await setDoc(ref, invite);
    return invite;
  },
  accept: async (inviteId: string) => {
    const user = await getAuthedUser();
    const inviteRef = userInviteDoc(user.uid, inviteId);
    const inviteSnap = await getDoc(inviteRef);
    if (!inviteSnap.exists()) {
      throw new Error("Invite no longer exists");
    }

    const invite = toApiGroupInvite(inviteSnap.data() as Record<string, unknown>, inviteSnap.id);
    const groupRef = await chatGroupDocForUser(user.uid, invite.groupId);
    const groupSnap = await getDoc(groupRef);

    if (!groupSnap.exists()) {
      await setDoc(groupRef, {
        id: invite.groupId,
        name: invite.groupName,
        createdAt: nowIso(),
        invitedBy: invite.fromUserId,
      });
    }

    const selfMemberRef = await chatGroupMemberDocForUser(user.uid, invite.groupId, user.uid);
    await setDoc(
      selfMemberRef,
      {
        id: user.uid,
        name: user.displayName || user.email || "You",
        email: user.email || null,
        role: "member",
      },
      { merge: true }
    );

    const inviterIndexRef = await chatGroupDocForUser(invite.fromUserId, invite.groupId);
    await setDoc(inviterIndexRef, {
      id: invite.groupId,
      name: invite.groupName,
      createdAt: nowIso(),
    }, { merge: true });

    await setDoc(
      sharedGroupDoc(invite.groupId),
      {
        id: invite.groupId,
        name: invite.groupName,
        createdAt: nowIso(),
        ownerId: invite.fromUserId,
      },
      { merge: true }
    );

    await Promise.all([
      setDoc(
        sharedGroupMemberDoc(invite.groupId, user.uid),
        {
          id: user.uid,
          name: user.displayName || user.email || "Member",
          email: user.email || null,
          role: "member",
          acceptedAt: nowIso(),
        },
        { merge: true }
      ),
      setDoc(
        sharedGroupMemberDoc(invite.groupId, invite.fromUserId),
        {
          id: invite.fromUserId,
          name: invite.fromName,
          email: invite.fromEmail || null,
          role: "owner",
        },
        { merge: true }
      ),
    ]);

    await updateDoc(inviteRef, { status: "accepted", respondedAt: nowIso() });
    return { status: "ok" as const, invite };
  },
  decline: async (inviteId: string) => {
    const user = await getAuthedUser();
    const ref = userInviteDoc(user.uid, inviteId);
    await updateDoc(ref, { status: "declined", respondedAt: nowIso() });
    return { status: "ok" };
  },
};
