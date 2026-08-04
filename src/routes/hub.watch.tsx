import { createFileRoute, Outlet } from "@tanstack/react-router";

// Layout route for Watch Together. The lobby lives in hub.watch.index.tsx and
// the live room in hub.watch.$code.tsx — this shell only renders the child.
export const Route = createFileRoute("/hub/watch")({
  component: WatchLayout,
});

function WatchLayout() {
  return <Outlet />;
}
