// @ts-nocheck
export interface HealthStatus {
  status: string;
}

export interface AnthropicConversation {
  id: number;
  title: string;
  createdAt: string;
}

export interface AnthropicMessage {
  id: number;
  conversationId: number;
  role: string;
  content: string;
  createdAt: string;
}

export interface AnthropicConversationInput {
  title: string;
}

export interface AnthropicMessageInput {
  content: string;
}

export interface AnthropicConversationWithMessages {
  id: number;
  title: string;
  createdAt: string;
  messages: AnthropicMessage[];
}

export interface AnthropicError {
  error: string;
}

export interface Lead {
  id: number;
  /** @nullable */
  conversationId?: number | null;
  /** @nullable */
  name?: string | null;
  /** @nullable */
  phone?: string | null;
  /** @nullable */
  email?: string | null;
  stage: string;
  adminStatus: string;
  /** @nullable */
  preferences?: string | null;
  createdAt: string;
}

export interface LeadStatusUpdate {
  adminStatus: string;
}

export interface LeadStats {
  total: number;
  withPhone: number;
  withEmail: number;
  todayCount: number;
}

