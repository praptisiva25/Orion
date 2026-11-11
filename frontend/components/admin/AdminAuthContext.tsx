
"use client";

import { createContext, useContext } from "react";

const AdminAuthContext = createContext(false);

export function useAdminAuth() {
  return useContext(AdminAuthContext);
}

export default AdminAuthContext;
