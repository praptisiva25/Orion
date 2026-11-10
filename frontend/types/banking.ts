
export interface AuthUser {
  id: number;
  fullName: string;
  email: string;
  roles: string[];
}

export interface CustomerProfile {
  id: number;
  fullName: string;
  email: string;
  phoneNumber: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  dateOfBirth: string | null;
  updatedAt: string;
}

export interface Application {
  id: number;
  userId: number;
  bankingProductId: number;
  product: string;
  requestedAmount: number;
  status: string;
  remarks: string | null;
  appliedAt: string;
  reviewedAt: string | null;
}

export interface KycDocument {
  id: number;
  userId?: number | null;
  documentType: string;
  fileName: string;
  status: string;
  uploadedAt: string;
  reviewedAt: string | null;
}

export interface Notification {
  id: number;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface UnreadCount {
  unreadCount: number;
}

export interface BankingProduct {
  id: number;
  name: string;
  category: string;
  description: string;
  interestRate: number;
  minimumAmount: number;
  createdAt: string;
}

export interface SupportTicket {
  id: number;
  userId: number;
  assignedOfficerId: number | null;
  subject: string;
  description: string;
  status: string;
  priority: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateProfileRequest {
  phoneNumber: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  dateOfBirth: string | null;
}

export interface CreateTicketRequest {
  subject: string;
  description: string;
  priority: string;
}

export interface OfficerTicketUpdate {
  status: "Open" | "InProgress" | "Resolved" | "Closed";
}

export interface KycReviewRequest {
  status: "Verified" | "Rejected";
}

export interface TicketMessage {
  id: number;
  supportTicketId: number;
  senderUserId: number;
  senderRole: string;
  message: string;
  sentAt: string;
}

export interface CreateTicketMessageRequest {
  message: string;
}