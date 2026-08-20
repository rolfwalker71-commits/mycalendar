export type MailAddress = {
  name: string;
  email: string;
  avatarUrl?: string | null;
};

export type MailLabel = {
  id: string;
  name: string;
  type: "system" | "user";
  color?: { backgroundColor: string; textColor: string } | null;
  messagesTotal: number;
  messagesUnread: number;
  threadsTotal: number;
  threadsUnread: number;
};

export type MailThreadSummary = {
  id: string;
  snippet: string;
  messageCount: number;
  from: MailAddress;
  to: MailAddress;
  subject: string;
  date: string;
  unread: boolean;
  starred: boolean;
  draft?: boolean;
  draftId?: string | null;
  labelIds?: string[];
  internalDate: string | null;
};

export type MailAttachment = {
  filename: string;
  mimeType: string;
  size: number;
  attachmentId: string;
  messageId: string;
};

export type MailMessage = {
  id: string;
  threadId: string;
  from: MailAddress;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  date: string;
  messageId: string;
  references: string;
  snippet: string;
  text: string;
  html: string;
  attachments: MailAttachment[];
  unread: boolean;
  starred: boolean;
  labelIds: string[];
  internalDate: string | null;
  cards?: { type: string; title: string; lines: string[] }[];
};

export type MailThread = {
  id: string;
  messages: MailMessage[];
  unread: boolean;
  starred: boolean;
  draft?: boolean;
  draftId?: string | null;
};

export type AppModule = "calendar" | "mail";
