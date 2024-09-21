import { GoogleAuth } from "google-auth-library";

let auth: GoogleAuth;

export async function getAccessToken(): Promise<string> {
  if (!auth) {
    auth = new GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/dialogflow"],
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    });
  }

  const client = await auth.getClient();
  const token = await client.getAccessToken();

  return token.token || "";
}
