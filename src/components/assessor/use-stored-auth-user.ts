"use client";

import { useEffect, useState } from "react";
import {
  AUTH_LOGIN_EMAIL_KEY,
  initialsFromLoginName,
  loginHandleFromStoredEmail,
} from "@/lib/auth-user";

export function useStoredAuthUser() {
  const [loginName, setLoginName] = useState("");
  const [displayHandle, setDisplayHandle] = useState("");
  const [initials, setInitials] = useState("?");

  useEffect(() => {
    const sync = () => {
      const name = localStorage.getItem(AUTH_LOGIN_EMAIL_KEY)?.trim() ?? "";
      setLoginName(name);
      setDisplayHandle(name ? loginHandleFromStoredEmail(name) : "");
      setInitials(name ? initialsFromLoginName(name) : "?");
    };

    sync();
    const onStorage = (event: StorageEvent) => {
      if (event.key === AUTH_LOGIN_EMAIL_KEY || event.key === null) {
        sync();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return { loginName, displayHandle, initials };
}
