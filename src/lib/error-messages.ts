import { toast } from "@/hooks/use-toast";

/**
 * Centralized error translator — converts raw database/API errors
 * into human-friendly messages for non-technical users.
 */
export function friendlyError(error: unknown): string {
  const msg = extractMessage(error);
  console.error("Raw error:", msg);

  // Duplicate key / unique constraint
  if (msg.includes("duplicate key value violates unique constraint")) {
    if (msg.includes("invoice")) return "An invoice with this number already exists. Please try again.";
    if (msg.includes("credit_note")) return "A credit note with this number already exists. Please try again.";
    return "This record already exists. Please check for duplicates and try again.";
  }

  // Row-level security
  if (msg.includes("row-level security") || msg.includes("new row violates row-level security")) {
    return "You don't have permission to perform this action. Please contact your administrator.";
  }

  // Permission denied
  if (msg.includes("permission denied")) {
    return "You don't have permission to perform this action. Please contact your administrator.";
  }

  // Null / required field
  if (msg.includes("null value in column")) {
    const col = msg.match(/null value in column "(\w+)"/)?.[1];
    return col
      ? `Required field "${formatColumnName(col)}" is missing. Please fill it in and try again.`
      : "A required field is missing. Please fill in all required fields.";
  }

  // Not-null constraint
  if (msg.includes("not-null constraint")) {
    return "A required field is missing. Please fill in all required fields.";
  }

  // Foreign key violation
  if (msg.includes("foreign key") || msg.includes("violates foreign key constraint")) {
    return "This record is linked to other data and cannot be modified or deleted right now.";
  }

  // Check constraint
  if (msg.includes("check constraint") || msg.includes("violates check constraint")) {
    return "The value entered is not valid. Please review your input and try again.";
  }

  // Network / connection errors
  if (msg.includes("fetch") || msg.includes("network") || msg.includes("Failed to fetch") || msg.includes("ERR_NETWORK")) {
    return "Unable to connect to the server. Please check your internet connection and try again.";
  }

  // Timeout
  if (msg.includes("timeout") || msg.includes("statement timeout")) {
    return "The request took too long. Please try again in a moment.";
  }

  // Auth errors
  if (msg.includes("JWT") || msg.includes("token") || msg.includes("not authenticated")) {
    return "Your session has expired. Please refresh the page and log in again.";
  }

  // Storage / file errors
  if (msg.includes("payload too large") || msg.includes("file size")) {
    return "The file is too large. Please reduce the file size and try again.";
  }

  // Generic user-thrown messages (from throw new Error("..."))
  // These are typically already user-friendly
  if (!msg.includes("violates") && !msg.includes("constraint") && msg.length < 120) {
    return msg;
  }

  // Fallback
  return "Something went wrong. Please try again or contact support if the problem persists.";
}

function extractMessage(error: unknown): string {
  if (!error) return "Unknown error";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && "message" in error) return String((error as any).message);
  return String(error);
}

function formatColumnName(col: string): string {
  return col
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Convenience: show a destructive toast with a friendly error message.
 * Usage: onError: (e) => toastError(e)
 * Or with custom title: onError: (e) => toastError(e, "Upload failed")
 */
export function toastError(error: unknown, title = "Error") {
  toast({ title, description: friendlyError(error), variant: "destructive" });
}
