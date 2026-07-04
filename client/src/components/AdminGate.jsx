import * as React from "react";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { getJSON, ADMIN_KEY_LS } from "@/lib/api";

// Wraps the whole admin surface: children render only after the stored admin
// key passes /api/admin/check. The key is sent automatically on every API call
// (see lib/api.js), and the server enforces it on all admin data endpoints —
// this gate is the login screen, not the security boundary.
export function AdminGate({ children }) {
  const [state, setState] = React.useState("checking"); // checking | locked | open

  React.useEffect(() => {
    if (!localStorage.getItem(ADMIN_KEY_LS)) return setState("locked");
    getJSON("/admin/check")
      .then(() => setState("open"))
      .catch(() => { localStorage.removeItem(ADMIN_KEY_LS); setState("locked"); });
  }, []);

  async function unlock(e) {
    e.preventDefault();
    localStorage.setItem(ADMIN_KEY_LS, e.target.key.value.trim());
    try {
      await getJSON("/admin/check");
      setState("open");
    } catch (err) {
      localStorage.removeItem(ADMIN_KEY_LS);
      toast.error(err.message);
    }
  }

  if (state === "open") return children;
  if (state === "checking") return null; // sub-second; a flash of the form would be worse

  return (
    <div className="grid min-h-screen place-items-center bg-background px-6">
      <div className="w-full max-w-md space-y-6 text-center">
        <img src="/logo.png" alt="" className="mx-auto h-12 w-auto" />
        <Card className="text-left">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><KeyRound className="size-4" /> Admin access</CardTitle>
            <CardDescription>This area is restricted. Enter the admin key to continue.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={unlock} className="space-y-4">
              <Field label="Admin key">
                <Input name="key" type="password" placeholder="Paste the admin key" autoFocus />
              </Field>
              <Button type="submit" className="w-full">Unlock</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
