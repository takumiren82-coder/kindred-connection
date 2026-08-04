import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { PanicButton } from "@/components/PanicButton";
import { useAccess } from "@/lib/access-context";

export const Route = createFileRoute("/hub")({
  component: HubLayout,
});

function HubLayout() {
  const { privateAccessGranted } = useAccess();
  const navigate = useNavigate();

  // GUARD: without granted access (default false, or after refresh), redirect
  // instantly to the article list. Children never render.
  useEffect(() => {
    if (!privateAccessGranted) {
      navigate({ to: "/", replace: true });
    }
  }, [privateAccessGranted, navigate]);

  // Disable the browser back button while inside the Private Hub.
  useEffect(() => {
    if (!privateAccessGranted || typeof window === "undefined") return;
    history.pushState(null, "", location.href);
    const onPop = () => history.pushState(null, "", location.href);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [privateAccessGranted]);

  if (!privateAccessGranted) return null;

  return (
    <div className="min-h-screen bg-background">
      <Outlet />
      <PanicButton />
    </div>
  );
}