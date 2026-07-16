import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, MailX, CheckCircle2, AlertCircle } from "lucide-react";

type State =
  | { kind: "loading" }
  | { kind: "valid" }
  | { kind: "invalid"; reason?: string }
  | { kind: "already" }
  | { kind: "submitting" }
  | { kind: "done" }
  | { kind: "error"; message: string };

export default function Unsubscribe() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    if (!token) {
      setState({ kind: "invalid", reason: "Missing token" });
      return;
    }
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
    fetch(
      `${supabaseUrl}/functions/v1/handle-email-unsubscribe?token=${encodeURIComponent(token)}`,
      { headers: { apikey: anonKey } }
    )
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
          setState({ kind: "invalid", reason: data.error });
          return;
        }
        if (data.valid === false && data.reason === "already_unsubscribed") {
          setState({ kind: "already" });
          return;
        }
        if (data.valid) setState({ kind: "valid" });
        else setState({ kind: "invalid", reason: data.error });
      })
      .catch((e) => setState({ kind: "error", message: String(e) }));
  }, [token]);

  const confirm = async () => {
    if (!token) return;
    setState({ kind: "submitting" });
    const { data, error } = await supabase.functions.invoke(
      "handle-email-unsubscribe",
      { body: { token } }
    );
    if (error) {
      setState({ kind: "error", message: error.message });
      return;
    }
    if (data?.success) setState({ kind: "done" });
    else if (data?.reason === "already_unsubscribed") setState({ kind: "already" });
    else setState({ kind: "error", message: "Could not unsubscribe" });
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md border-border/60 shadow-sm">
        <CardContent className="p-8 text-center space-y-5">
          <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
            {state.kind === "loading" || state.kind === "submitting" ? (
              <Loader2 className="h-7 w-7 text-primary animate-spin" />
            ) : state.kind === "done" || state.kind === "already" ? (
              <CheckCircle2 className="h-7 w-7 text-primary" />
            ) : state.kind === "invalid" || state.kind === "error" ? (
              <AlertCircle className="h-7 w-7 text-destructive" />
            ) : (
              <MailX className="h-7 w-7 text-primary" />
            )}
          </div>

          {state.kind === "loading" && (
            <>
              <h1 className="text-xl font-semibold">Checking your link…</h1>
              <p className="text-sm text-muted-foreground">One moment please.</p>
            </>
          )}

          {state.kind === "valid" && (
            <>
              <h1 className="text-xl font-semibold">Unsubscribe from emails?</h1>
              <p className="text-sm text-muted-foreground">
                You'll stop receiving non-essential emails from Sprouts. Important
                account messages will still be sent.
              </p>
              <Button className="w-full" onClick={confirm}>
                Confirm unsubscribe
              </Button>
            </>
          )}

          {state.kind === "submitting" && (
            <>
              <h1 className="text-xl font-semibold">Unsubscribing…</h1>
            </>
          )}

          {state.kind === "done" && (
            <>
              <h1 className="text-xl font-semibold">You're unsubscribed</h1>
              <p className="text-sm text-muted-foreground">
                We're sorry to see you go. You can re-subscribe anytime from your
                account settings.
              </p>
            </>
          )}

          {state.kind === "already" && (
            <>
              <h1 className="text-xl font-semibold">Already unsubscribed</h1>
              <p className="text-sm text-muted-foreground">
                This email address has already been removed from our list.
              </p>
            </>
          )}

          {state.kind === "invalid" && (
            <>
              <h1 className="text-xl font-semibold">Link is invalid or expired</h1>
              <p className="text-sm text-muted-foreground">
                {state.reason ||
                  "Please use the unsubscribe link from a recent email."}
              </p>
            </>
          )}

          {state.kind === "error" && (
            <>
              <h1 className="text-xl font-semibold">Something went wrong</h1>
              <p className="text-sm text-muted-foreground">{state.message}</p>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}