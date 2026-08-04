import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Mail, Lock, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/lib/supabase";
import heroBg from "@/assets/library-hero.jpg";
import girl from "@/assets/library-girl.png";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "NEALTH — Your Story Begins Here" },
      { name: "description", content: "Sign in to NEALTH to continue your reading journey through the world's great books." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setErr("");
    setLoading(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined },
        });
        if (error) throw error;
      }
      navigate({ to: "/" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const google = async () => {
    setErr("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: typeof window !== "undefined" ? window.location.origin : undefined },
    });
    if (error) setErr(error.message);
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0a0a0f] font-body text-neutral-100">
      <img
        src={heroBg}
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover opacity-70"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0f]/40 via-[#0a0a0f]/60 to-[#0a0a0f]" />

      <div className="relative mx-auto flex min-h-screen max-w-md flex-col px-6 pt-14 pb-40">
        <div className="text-center">
          <div className="mx-auto mb-2 h-8 w-8 rounded-full bg-[#c9a84c]/20 ring-1 ring-[#c9a84c]/40" />
          <h1 className="font-heading text-5xl font-bold tracking-[0.25em] text-[#c9a84c] drop-shadow-[0_0_18px_rgba(201,168,76,0.5)]">
            NEALTH
          </h1>
          <p className="mt-2 font-heading text-[10px] tracking-[0.4em] text-[#c9a84c]/80">
            YOUR STORY BEGINS HERE
          </p>
        </div>

        <div className="mt-8 rounded-2xl border border-[#c9a84c]/25 bg-[#0a0a0f]/70 p-6 shadow-[0_0_40px_rgba(0,0,0,0.6)] backdrop-blur-xl">
          <h2 className="text-center font-heading text-xl font-semibold text-neutral-50">
            {mode === "login" ? "Welcome Back" : "Create Account"}
          </h2>
          <p className="mt-1 text-center text-xs text-neutral-400">
            {mode === "login" ? "Login to continue your reading journey" : "Begin your reading journey"}
          </p>

          <div className="mt-6 space-y-3">
            <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-3">
              <Mail className="h-4 w-4 text-neutral-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email or Username"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-neutral-500"
              />
            </label>
            <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-3">
              <Lock className="h-4 w-4 text-neutral-400" />
              <input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-neutral-500"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="text-neutral-400 hover:text-neutral-200"
                aria-label="Toggle password visibility"
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </label>
          </div>

          <div className="mt-2 flex justify-end">
            <button className="text-xs font-medium text-[#c9a84c] hover:underline">Forgot Password?</button>
          </div>

          {err && <p className="mt-3 text-center text-xs text-red-400">{err}</p>}

          <button
            onClick={submit}
            disabled={loading}
            className="mt-4 w-full rounded-xl bg-gradient-to-r from-[#e6c76a] via-[#c9a84c] to-[#8a6b1f] py-3 font-heading text-sm font-semibold tracking-wider text-[#1a1408] shadow-[0_0_18px_rgba(201,168,76,0.5)] disabled:opacity-60"
          >
            {loading ? "Please wait..." : mode === "login" ? "Log In" : "Sign Up"}
          </button>

          <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-widest text-neutral-500">
            <span className="h-px flex-1 bg-white/10" />
            or continue with
            <span className="h-px flex-1 bg-white/10" />
          </div>

          <button
            onClick={google}
            className="flex w-full items-center justify-center gap-3 rounded-xl bg-white py-3 text-sm font-semibold text-neutral-800 shadow"
          >
            <GoogleIcon />
            Continue with Google
          </button>

          <p className="mt-5 text-center text-xs text-neutral-400">
            {mode === "login" ? "Don't have an account? " : "Already have an account? "}
            <button
              className="font-semibold text-[#c9a84c] hover:underline"
              onClick={() => setMode(mode === "login" ? "signup" : "login")}
            >
              {mode === "login" ? "Create Account" : "Log In"}
            </button>
          </p>
          <p className="mt-3 text-center text-[11px] text-neutral-500">
            <Link to="/" className="hover:text-[#c9a84c]">Continue as guest →</Link>
          </p>
        </div>
      </div>

      <img
        src={girl}
        alt=""
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-1/2 h-56 w-56 -translate-x-1/2 object-contain opacity-90"
      />
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5">
      <path fill="#EA4335" d="M24 9.5c3.4 0 6.4 1.2 8.8 3.3l6.5-6.5C35.3 2.4 30 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.6 5.9C12.2 13.6 17.6 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.5 3-2.3 5.5-4.8 7.2l7.4 5.8c4.3-4 6.7-9.9 6.7-17.5z" />
      <path fill="#FBBC05" d="M10.2 28.8c-.5-1.5-.8-3.1-.8-4.8s.3-3.3.8-4.8l-7.6-5.9C.9 16.6 0 20.2 0 24s.9 7.4 2.6 10.7l7.6-5.9z" />
      <path fill="#34A853" d="M24 48c6.5 0 12-2.1 15.9-5.8l-7.4-5.8c-2.1 1.4-4.8 2.3-8.5 2.3-6.4 0-11.8-4.1-13.8-9.7l-7.6 5.9C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}