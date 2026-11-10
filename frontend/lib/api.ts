
import type {
  Application,
  AuthUser,
  CustomerProfile,
  KycDocument,
  Notification,
  UnreadCount,
  BankingProduct,
  SupportTicket,
  UpdateProfileRequest,
  CreateTicketRequest,
  TicketMessage,
} from "@/types/banking";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  if (!API_URL) {
    throw new Error("API URL is not configured.");
  }

  const token =
    typeof window !== "undefined"
      ? sessionStorage.getItem("token")
      : null;

  const headers = new Headers(options.headers);

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  if (
    options.body &&
    !(options.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
    cache: "no-store",
  });

  const responseText = await response.text();

  let data: unknown = null;

  if (responseText) {
    try {
      data = JSON.parse(responseText);
    } catch {
      data = responseText;
    }
  }

  if (!response.ok) {
    const message =
      typeof data === "object" &&
      data !== null &&
      "message" in data &&
      typeof data.message === "string"
        ? data.message
        : `Request failed (${response.status}).`;

    throw new ApiError(message, response.status);
  }

  return data as T;
}

export const bankingApi = {
  getCurrentUser: () => apiRequest<AuthUser>("/api/auth/me"),

  getProfile: () =>
    apiRequest<CustomerProfile>("/api/customer/profile"),

  updateProfile: (data: UpdateProfileRequest) =>
    apiRequest<{ message: string; profile: CustomerProfile }>(
      "/api/customer/profile",
      {
        method: "PUT",
        body: JSON.stringify(data),
      }
    ),

  getProducts: () =>
    apiRequest<BankingProduct[]>("/api/products"),

  getProduct: (id: number) =>
    apiRequest<BankingProduct>(`/api/products/${id}`),

  getApplications: () =>
    apiRequest<Application[]>("/api/applications/my"),

  createApplication: (data: {
    bankingProductId: number;
    requestedAmount: number;
    remarks: string;
  }) =>
    apiRequest<{ message: string; application: Application }>(
      "/api/applications",
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    ),

  getKycDocuments: () =>
    apiRequest<KycDocument[]>("/api/kyc/my"),

  uploadKyc: (file: File, documentType: string) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("DocumentType", documentType);

    return apiRequest<{ message: string; document: KycDocument }>(
      "/api/kyc/upload",
      {
        method: "POST",
        body: formData,
      }
    );
  },

  getNotifications: () =>
    apiRequest<Notification[]>("/api/notifications"),

  getUnreadCount: () =>
    apiRequest<UnreadCount>("/api/notifications/unread-count"),

  markNotificationRead: (id: number) =>
    apiRequest<{ message: string }>(
      `/api/notifications/${id}/read`,
      { method: "PUT" }
    ),

  getMyTickets: () =>
    apiRequest<SupportTicket[]>("/api/support-tickets/my"),

  getTicket: (id: number) =>
    apiRequest<SupportTicket>(`/api/support-tickets/${id}`),

  createTicket: (data: CreateTicketRequest) =>
    apiRequest<{ message: string; ticket: SupportTicket }>(
      "/api/support-tickets",
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    ),

    getOfficerTickets: () =>
        apiRequest<SupportTicket[]>("/api/officer/tickets"),

    getOfficerTicket: (id: number) =>
        apiRequest<SupportTicket>(`/api/officer/tickets/${id}`),
    
    updateOfficerTicketStatus: (
        id: number,
        status: string
    ) =>
        apiRequest<{ message: string; ticketId: number; status: string }>(
            `/api/officer/tickets/${id}/status`,
            {
                method: "PUT",
                body: JSON.stringify({ status }),
            }
        ),
        
    getAllKycDocuments: () =>
        apiRequest<KycDocument[]>("/api/kyc/all"),
    
    reviewKycDocument: (id: number, status: string) =>
        apiRequest<{ message: string }>(
            `/api/kyc/${id}/review`,
            {
                method: "PUT",
                body: JSON.stringify({ status }),
            }
        ),

    getCustomerTicketMessages: (ticketId: number) =>
        apiRequest<TicketMessage[]>(
            `/api/support-tickets/${ticketId}/messages`
        ),
    
    sendCustomerTicketMessage: (ticketId: number, message: string) =>
        apiRequest<{ message: string; data: TicketMessage }>(
            `/api/support-tickets/${ticketId}/messages`,
            {
                method: "POST",
                body: JSON.stringify({ message }),
            }
        ),
        
    getOfficerTicketMessages: (ticketId: number) =>
        apiRequest<TicketMessage[]>(
            `/api/officer/tickets/${ticketId}/messages`
        ),
        
    sendOfficerTicketMessage: (ticketId: number, message: string) =>
        apiRequest<{ message: string; data: TicketMessage }>(
            `/api/officer/tickets/${ticketId}/messages`,
            {
                method: "POST",
                body: JSON.stringify({ message }),
            }
        ),
};