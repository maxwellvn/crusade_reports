import * as React from "react";
import { LogIn } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getJSON } from "@/lib/api";

const AdminContext = React.createContext(null);
export const useAdmin = () => React.useContext(AdminContext);

export function AdminGate({ children }) {
  const [state, setState] = React.useState("checking");
  const [message, setMessage] = React.useState("");
  const [admin, setAdmin] = React.useState(null);

  React.useEffect(() => {
    const error = new URLSearchParams(window.location.search).get("auth_error");
    if (error) setMessage(error.replaceAll("_", " "));
    getJSON("/auth/me").then((user) => { setAdmin(user); setState("open"); }).catch((err) => {
      setMessage((current) => current || err.message);
      setState("locked");
    });
  }, []);

  if (state === "open") return <AdminContext.Provider value={admin}>{children}</AdminContext.Provider>;
  if (state === "checking") return null;

  return (
    <div className="grid min-h-screen place-items-center bg-background px-6">
      <div className="w-full max-w-md space-y-6 text-center">
        <img src="/logo.png" alt="" className="mx-auto h-12 w-auto" />
        <Card className="text-left">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><LogIn className="size-4" /> Dashboard access</CardTitle>
            <CardDescription>Sign in with an approved KingsChat account to continue.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {message && <p className="border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">{message}</p>}
            <Button asChild className="w-full">
              <a href="/api/auth/kingschat/login">Continue with KingsChat</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
