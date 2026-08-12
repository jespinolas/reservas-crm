import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { clearAccessToken, loadAccessToken, saveAccessToken } from "./src/session";
import { Contact, Conversation, Message, ReservasApi } from "./src/api";

const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8080";

export default function App() {
  const api = useMemo(() => new ReservasApi(apiUrl), []);
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [tab, setTab] = useState<"inbox" | "contacts">("inbox");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAccessToken()
      .then(async (storedToken) => {
        if (!storedToken) return;
        api.setToken(storedToken);
        await refresh(storedToken);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not restore session"))
      .finally(() => setLoading(false));
  }, [api]);

  async function refresh(activeToken = token) {
    if (!activeToken) return;
    api.setToken(activeToken);
    const [nextContacts, nextConversations] = await Promise.all([api.contacts(), api.conversations()]);
    setContacts(nextContacts);
    setConversations(nextConversations);
  }

  async function login() {
    setError(null);
    setLoading(true);
    try {
      const session = await api.login(email.trim(), password);
      await saveAccessToken(session.accessToken);
      api.setToken(session.accessToken);
      setToken(session.accessToken);
      await refresh(session.accessToken);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not sign in");
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await clearAccessToken();
    api.setToken(null);
    setToken(null);
    setContacts([]);
    setConversations([]);
    setSelectedConversation(null);
    setMessages([]);
  }

  if (loading && !token) return <Splash />;
  if (!token) return <Login email={email} password={password} setEmail={setEmail} setPassword={setPassword} onLogin={login} loading={loading} error={error} />;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>RESERVAS CORE</Text>
          <Text style={styles.title}>Your business inbox</Text>
        </View>
        <Pressable onPress={logout}><Text style={styles.link}>Sign out</Text></Pressable>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.tabs}>
        <Pressable style={[styles.tab, tab === "inbox" && styles.activeTab]} onPress={() => setTab("inbox")}><Text style={styles.tabText}>Inbox ({conversations.length})</Text></Pressable>
        <Pressable style={[styles.tab, tab === "contacts" && styles.activeTab]} onPress={() => setTab("contacts")}><Text style={styles.tabText}>Contacts ({contacts.length})</Text></Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {tab === "inbox" ? selectedConversation ? <ConversationDetail conversation={selectedConversation} messages={messages} draft={draft} setDraft={setDraft} sending={sending} onBack={() => setSelectedConversation(null)} onSend={async () => { if (!draft.trim()) return; setSending(true); try { const message = await api.sendManualReply(selectedConversation.id, draft.trim(), `mobile-${Date.now()}-${Math.random()}`); setMessages((current) => [...current, message]); setDraft(""); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not send reply"); } finally { setSending(false); } }} /> : <Inbox conversations={conversations} onSelect={async (conversation) => { setError(null); setSelectedConversation(conversation); try { setMessages(await api.messages(conversation.id)); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load conversation"); } }} /> : <Contacts contacts={contacts} />}
      </ScrollView>
    </SafeAreaView>
  );
}

function Splash() {
  return <View style={styles.splash}><ActivityIndicator color="#0b6b57" /><Text style={styles.subtitle}>Connecting to Reservas Core…</Text></View>;
}

function Login(props: { email: string; password: string; setEmail: (value: string) => void; setPassword: (value: string) => void; onLogin: () => void; loading: boolean; error: string | null }) {
  return <SafeAreaView style={styles.safe}><StatusBar style="dark" /><View style={styles.login}><Text style={styles.eyebrow}>RESERVAS CRM</Text><Text style={styles.hero}>Reply from anywhere.</Text><Text style={styles.subtitle}>Sign in to your business inbox.</Text><TextInput autoCapitalize="none" keyboardType="email-address" placeholder="Email" value={props.email} onChangeText={props.setEmail} style={styles.input} /><TextInput secureTextEntry placeholder="Password" value={props.password} onChangeText={props.setPassword} style={styles.input} />{props.error ? <Text style={styles.error}>{props.error}</Text> : null}<Pressable disabled={props.loading} onPress={props.onLogin} style={styles.primary}><Text style={styles.primaryText}>{props.loading ? "Signing in…" : "Sign in"}</Text></Pressable></View></SafeAreaView>;
}

function Inbox({ conversations, onSelect }: { conversations: Conversation[]; onSelect: (conversation: Conversation) => void }) {
  if (!conversations.length) return <Empty title="No conversations yet" text="New customer conversations will appear here." />;
  return <>{conversations.map((conversation) => <Pressable key={conversation.id} style={styles.card} onPress={() => onSelect(conversation)}><View style={styles.row}><Text style={styles.cardTitle}>{conversation.channel}</Text>{conversation.unreadCount > 0 ? <Text style={styles.badge}>{conversation.unreadCount}</Text> : null}</View><Text style={styles.muted}>Conversation {conversation.id.slice(0, 8)}</Text><Text style={styles.muted}>{conversation.aiEnabled ? "AI enabled" : "Manual replies"}</Text></Pressable>)}</>;
}

function ConversationDetail({ conversation, messages, draft, setDraft, sending, onBack, onSend }: { conversation: Conversation; messages: Message[]; draft: string; setDraft: (value: string) => void; sending: boolean; onBack: () => void; onSend: () => void }) {
  return <View style={styles.detail}><Pressable onPress={onBack}><Text style={styles.link}>‹ Back to inbox</Text></Pressable><Text style={styles.cardTitle}>{conversation.channel} conversation</Text><View style={styles.messageList}>{messages.length ? messages.map((message) => <View key={message.id} style={[styles.message, message.direction === "out" && styles.outMessage]}><Text style={styles.muted}>{message.text ?? `[${message.type}]`}</Text><Text style={styles.tiny}>{message.status}</Text></View>) : <Empty title="No messages yet" text="The conversation is ready for a reply." />}</View><TextInput multiline placeholder="Write a manual reply…" value={draft} onChangeText={setDraft} style={[styles.input, styles.composer]} /><Pressable disabled={sending || !draft.trim()} onPress={onSend} style={[styles.primary, (sending || !draft.trim()) && styles.disabled]}><Text style={styles.primaryText}>{sending ? "Saving…" : "Save reply"}</Text></Pressable></View>;
}

function Contacts({ contacts }: { contacts: Contact[] }) {
  if (!contacts.length) return <Empty title="No contacts yet" text="Create contacts from the web CRM or an incoming provider event." />;
  return <>{contacts.map((contact) => <View key={contact.id} style={styles.card}><Text style={styles.cardTitle}>{contact.name}</Text><Text style={styles.muted}>{contact.phone}</Text>{contact.notes ? <Text style={styles.muted}>{contact.notes}</Text> : null}</View>)}</>;
}

function Empty({ title, text }: { title: string; text: string }) {
  return <View style={styles.empty}><Text style={styles.cardTitle}>{title}</Text><Text style={styles.muted}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f7f8f6" },
  splash: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: "#f7f8f6" },
  login: { flex: 1, justifyContent: "center", padding: 28, gap: 14 },
  header: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  content: { padding: 22, gap: 12 },
  eyebrow: { color: "#0b6b57", fontSize: 12, fontWeight: "800", letterSpacing: 1.6 },
  title: { color: "#15201c", fontSize: 25, fontWeight: "800", marginTop: 4 },
  hero: { color: "#15201c", fontSize: 36, lineHeight: 40, fontWeight: "800", marginTop: 8 },
  subtitle: { color: "#68756f", fontSize: 15 },
  input: { backgroundColor: "#fff", borderColor: "#dce4df", borderRadius: 12, borderWidth: 1, padding: 15, fontSize: 16 },
  primary: { alignItems: "center", backgroundColor: "#0b6b57", borderRadius: 12, padding: 16, marginTop: 4 },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  link: { color: "#0b6b57", fontWeight: "700", paddingTop: 5 },
  tabs: { flexDirection: "row", borderBottomColor: "#e1e7e3", borderBottomWidth: 1, paddingHorizontal: 22 },
  tab: { paddingVertical: 13, marginRight: 22 },
  activeTab: { borderBottomColor: "#0b6b57", borderBottomWidth: 2 },
  tabText: { color: "#42534b", fontWeight: "700" },
  card: { backgroundColor: "#fff", borderColor: "#e5ebe7", borderRadius: 15, borderWidth: 1, padding: 16, gap: 6 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { color: "#15201c", fontSize: 17, fontWeight: "800" },
  muted: { color: "#68756f", fontSize: 14 },
  badge: { backgroundColor: "#d9f2e8", borderRadius: 10, color: "#0b6b57", fontWeight: "800", overflow: "hidden", paddingHorizontal: 8, paddingVertical: 3 },
  empty: { alignItems: "center", backgroundColor: "#fff", borderRadius: 15, gap: 8, padding: 28 },
  error: { color: "#b42318", fontSize: 14 },
  detail: { gap: 14 },
  messageList: { gap: 8 },
  message: { alignSelf: "flex-start", backgroundColor: "#eef2ef", borderRadius: 12, maxWidth: "88%", padding: 12 },
  outMessage: { alignSelf: "flex-end", backgroundColor: "#d9f2e8" },
  tiny: { color: "#829088", fontSize: 11, marginTop: 4 },
  composer: { minHeight: 90, textAlignVertical: "top" },
  disabled: { opacity: 0.45 },
});
