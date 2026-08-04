import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

// Memory-only access flag for the Private Hub.
// IMPORTANT: this state lives in React memory ONLY. It is never written to
// localStorage, sessionStorage, or cookies — so a browser refresh clears it
// and privateAccessGranted resets to false automatically.
interface AccessContextValue {
  privateAccessGranted: boolean;
  grantAccess: () => void;
  revokeAccess: () => void;
}

const AccessContext = createContext<AccessContextValue | undefined>(undefined);

export function AccessProvider({ children }: { children: ReactNode }) {
  const [privateAccessGranted, setGranted] = useState(false); // always FALSE by default
  const grantAccess = useCallback(() => setGranted(true), []);
  const revokeAccess = useCallback(() => setGranted(false), []);
  return (
    <AccessContext.Provider value={{ privateAccessGranted, grantAccess, revokeAccess }}>
      {children}
    </AccessContext.Provider>
  );
}

export function useAccess() {
  const ctx = useContext(AccessContext);
  if (!ctx) throw new Error("useAccess must be used within an AccessProvider");
  return ctx;
}