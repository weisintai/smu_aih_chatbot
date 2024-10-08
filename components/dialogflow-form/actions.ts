"use server";

import { cookies } from "next/headers";
import {
  SESSION_COOKIE_NAME,
  SESSION_EXPIRY_COOKIE_NAME,
} from "@/utils/sessionManagement";

export async function resetSessionCookies() {
  cookies().set({
    name: SESSION_COOKIE_NAME,
    value: "",
    expires: new Date(0),
    path: "/", // Adjust the path as needed
  });

  cookies().set({
    name: SESSION_EXPIRY_COOKIE_NAME,
    value: "",
    expires: new Date(0),
    path: "/", // Adjust the path as needed
  });
}
