declare global {
  namespace NodeJS {
    interface ProcessEnv {
      GCLOUD_ACCESS_TOKEN: string;
      GCLOUD_PROJECT_ID: string;
      GCLOUD_SUBDOMAIN_REGION: string;
      GCLOUD_REGION_ID: string;
      GCLOUD_AGENT_ID: string;
      GOOGLE_APPLICATION_CREDENTIALS: string;
    }
  }
}

// If this file has no import/export statements (i.e. is a script)
// convert it into a module by adding an empty export statement.
export {};
