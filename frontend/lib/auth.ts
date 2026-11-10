
export interface AuthUser {
  id: number;
  fullName: string;
  email: string;
  roles: string[];
}

export interface AuthResponse {
  token: string;
  expiresAt: string;
  user: AuthUser;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export async function login(
  email: string,
  password: string
): Promise<AuthResponse> {
  const response = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Login failed.");
  }

  return data as AuthResponse;
}
