
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
  customerName?: string | null;
  customerEmail?: string | null;
  bankingProductId: number;
  product: string;
  requestedAmount: number;
  status: string;
  remarks: string | null;
  appliedAt: string;
  reviewedAt: string | null;
  reviewerName?: string | null;
  reviewReason: string | null;
}

export interface KycDocument {
  id: number;
  userId?: number | null;
  customerName?: string | null;
  customerEmail?: string | null;
  documentType: string;
  fileName: string;
  status: string;
  uploadedAt: string;
  reviewedAt: string | null;
  reviewerName?: string | null;
  reviewReason: string | null;
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
  isActive: boolean;
  createdAt: string;
}

export interface AdminCustomer {
  id: number;
  fullName: string;
  email: string;
  isActive: boolean;
  createdAt: string;
  phoneNumber: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  dateOfBirth: string | null;
}

export interface AdminOfficer {
  id: number;
  fullName: string;
  email: string;
  isActive: boolean;
  createdAt: string;
}

export interface AdminActivity {
  type: string;
  description: string;
  status: string;
  timestamp: string;
}

export interface AdminDashboard {
  totalCustomers: number;
  totalOfficers: number;
  totalBankingProducts: number;
  totalApplications: number;
  pendingApplications: number;
  approvedApplications: number;
  rejectedApplications: number;
  totalKycDocuments: number;
  pendingKyc: number;
  totalSupportTickets: number;
  openSupportTickets: number;
  resolvedSupportTickets: number;
  recentApplications: AdminActivity[];
  recentKycSubmissions: AdminActivity[];
  recentSupportTickets: AdminActivity[];
  recentOfficers: AdminOfficer[];
}

export interface AdminSupportTicket extends SupportTicket {
  customerName: string;
  customerEmail: string;
  assignedOfficerName: string | null;
}

export interface AdminSentimentDistribution {
  totalTickets: number;
  analyzedTickets: number;
  unanalyzedTickets: number;
  positiveCount: number;
  neutralCount: number;
  negativeCount: number;
  positivePercentage: number;
  neutralPercentage: number;
  negativePercentage: number;
}

export interface AdminSentimentTrendPoint {
  date: string;
  positiveCount: number;
  neutralCount: number;
  negativeCount: number;
  totalCount: number;
}

export interface AdminSentimentTrends {
  fromDate: string;
  toDate: string;
  points: AdminSentimentTrendPoint[];
}

export interface AdminTicketSentimentInsight {
  ticketId: number;
  status: string;
  priority: string;
  sentimentLabel: "positive" | "neutral" | "negative";
  confidence: number;
  analyzedAt: string;
  eventSequence: number;
}

export interface AdminTicketSentimentInsightsPage {
  page: number;
  pageSize: number;
  totalCount: number;
  items: AdminTicketSentimentInsight[];
}

export interface AdminTicketMessage extends TicketMessage {
  senderName: string;
}

export interface AdminAuditLog {
  id: number;
  userId: number | null;
  actorName: string | null;
  actorEmail: string | null;
  actorRoles: string | null;
  category: string;
  action: string;
  entityType: string;
  entityId: number | null;
  description: string | null;
  timestamp: string;
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
