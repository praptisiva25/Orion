
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
  AdminDashboard,
  AdminCustomer,
  AdminOfficer,
  AdminSupportTicket,
  AdminTicketMessage,
  AdminAuditLog,
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
    let message = `Request failed (${response.status}).`;
    if (typeof data === "string" && data.trim()) {
      message = data;
    } else if (Array.isArray(data)) {
      message = data.filter((item): item is string => typeof item === "string").join(" ") || message;
    } else if (typeof data === "object" && data !== null) {
      if ("message" in data && typeof data.message === "string") message = data.message;
      else if ("title" in data && typeof data.title === "string") message = data.title;
      else if ("errors" in data && Array.isArray(data.errors)) {
        message = data.errors.filter((item): item is string => typeof item === "string").join(" ") || message;
      }
    }

    throw new ApiError(message, response.status);
  }

  return data as T;
}

async function apiFileRequest(endpoint: string): Promise<Blob> {
  if (!API_URL) throw new Error("API URL is not configured.");
  const token = typeof window !== "undefined"
    ? sessionStorage.getItem("token")
    : null;
  const response = await fetch(`${API_URL}${endpoint}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: "no-store",
  });
  if (!response.ok) {
    let message = `Request failed (${response.status}).`;
    try {
      const data = await response.json();
      if (typeof data.message === "string") message = data.message;
    } catch {
      // Keep the status based message for non-JSON error responses.
    }
    throw new ApiError(message, response.status);
  }
  return response.blob();
}

export const bankingApi = {
  getCurrentUser: () => apiRequest<AuthUser>("/api/auth/me"),

  getAdminDashboard: () => apiRequest<AdminDashboard>("/api/admin/dashboard/summary"),
  getAdminCustomers: (search = "", isActive?: boolean) => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (isActive !== undefined) params.set("isActive", String(isActive));
    return apiRequest<AdminCustomer[]>(`/api/admin/customers${params.size ? `?${params}` : ""}`);
  },
  getAdminCustomer: (id: number) => apiRequest<AdminCustomer>(`/api/admin/customers/${id}`),
  setAdminCustomerStatus: (id: number, isActive: boolean) =>
    apiRequest<{ message: string; id: number; isActive: boolean }>(`/api/admin/customers/${id}/status?isActive=${isActive}`, { method: "PUT" }),

  getAdminOfficers: () => apiRequest<AdminOfficer[]>("/api/admin/officers"),
  createAdminOfficer: (data: { fullName: string; email: string; password: string }) =>
    apiRequest<{ message: string; officerId: number; fullName: string; email: string; role: string }>("/api/admin/officers", { method: "POST", body: JSON.stringify(data) }),
  setAdminOfficerStatus: (id: number, isActive: boolean) =>
    apiRequest<{ message: string; officerId: number; isActive: boolean }>(`/api/admin/officers/${id}/status?isActive=${isActive}`, { method: "PUT" }),

  getAdminProducts: () => apiRequest<BankingProduct[]>("/api/products/admin"),
  createAdminProduct: (data: Omit<BankingProduct, "id" | "isActive" | "createdAt">) =>
    apiRequest<BankingProduct>("/api/products", { method: "POST", body: JSON.stringify(data) }),
  updateAdminProduct: (id: number, data: Omit<BankingProduct, "id" | "isActive" | "createdAt">) =>
    apiRequest<{ message: string; product: BankingProduct }>(`/api/products/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  setAdminProductStatus: (id: number, isActive: boolean) =>
    apiRequest<{ message: string; product: BankingProduct }>(`/api/products/${id}/status?isActive=${isActive}`, { method: "PUT" }),

  getAdminApplications: () => apiRequest<Application[]>("/api/applications/all"),
  getAdminSupportTickets: (filters: { search?: string; status?: string; priority?: string; fromDate?: string; toDate?: string } = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
    return apiRequest<AdminSupportTicket[]>(`/api/admin/support-tickets${params.size ? `?${params}` : ""}`);
  },
  getAdminSupportTicket: (id: number) =>
    apiRequest<{ ticket: AdminSupportTicket; messages: AdminTicketMessage[] }>(`/api/admin/support-tickets/${id}`),
  assignAdminSupportTicket: (id: number, officerId: number | null) =>
    apiRequest<{ message: string; ticketId: number; assignedOfficerId: number | null; assignedOfficerName: string | null }>(`/api/admin/support-tickets/${id}/assignment`, { method: "PUT", body: JSON.stringify({ officerId }) }),
  getAdminAuditLogs: (filters: { search?: string; action?: string; entityType?: string; category?: string; actorId?: number; entityId?: number; fromDate?: string; toDate?: string; page?: number; pageSize?: number } = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => { if (value !== undefined && value !== "") params.set(key, String(value)); });
    return apiRequest<{ items: AdminAuditLog[]; totalCount: number }>(`/api/admin/audit-logs${params.size ? `?${params}` : ""}`);
  },

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
    getOfficerTicketHistory: (filters: { status?: string; priority?: string; fromDate?: string; toDate?: string } = {}) => {
        const params = new URLSearchParams(); Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
        return apiRequest<SupportTicket[]>(`/api/officer/tickets/history${params.size ? `?${params}` : ""}`);
    },

    getOfficerTicket: (id: number) =>
        apiRequest<SupportTicket>(`/api/officer/tickets/${id}`),

    generateOfficerTicketSummary: (id: number) =>
        apiRequest<{ result: string }>(`/api/officer/tickets/${id}/ai-summary`, { method: "POST" }),

    generateOfficerSuggestedResponse: (id: number) =>
        apiRequest<{ result: string }>(`/api/officer/tickets/${id}/suggested-response`, { method: "POST" }),
    
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
    getOfficerKycHistory: (filters: { status?: string; documentType?: string; customer?: string; fromDate?: string; toDate?: string } = {}) => {
        const params = new URLSearchParams(); Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
        return apiRequest<KycDocument[]>(`/api/kyc/review-history${params.size ? `?${params}` : ""}`);
    },
    
    getKycDocumentFile: (id: number, download = false) =>
        apiFileRequest(`/api/kyc/${id}/file${download ? "?download=true" : ""}`),

    reviewKycDocument: (id: number, status: "Verified" | "Rejected", reviewReason?: string) =>
        apiRequest<{ message: string }>(
            `/api/kyc/${id}/review`,
            {
                method: "PUT",
                body: JSON.stringify({ status, reviewReason }),
            }
        ),

    getOfficerApplications: () =>
        apiRequest<Application[]>("/api/applications/review-queue"),
    getOfficerApplicationHistory: (filters: { status?: string; customer?: string; product?: string; fromDate?: string; toDate?: string } = {}) => {
        const params = new URLSearchParams(); Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
        return apiRequest<Application[]>(`/api/applications/review-history${params.size ? `?${params}` : ""}`);
    },

    getOfficerApplication: (id: number) =>
        apiRequest<Application>(`/api/applications/review/${id}`),

    reviewApplication: (id: number, status: "Approved" | "Rejected", reviewReason?: string) =>
        apiRequest<{ message: string }>(
            `/api/applications/${id}/status`,
            {
                method: "PUT",
                body: JSON.stringify({ status, reviewReason }),
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
