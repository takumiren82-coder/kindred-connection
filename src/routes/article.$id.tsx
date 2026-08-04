import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeft, Heart, Pencil, Send, List } from "lucide-react";
import { useState } from "react";
import { getArticle } from "@/data/articles";
import { PrivateHubTransition } from "@/components/PrivateHubTransition";
import { supabase } from "@/lib/supabase";
import { useAccess } from "@/lib/access-context";

export const Route = createFileRoute("/article/$id")({
  head: () => ({
    meta: [
      { title: "Article — The Nealth Ecosystem" },
      { name: "description", content: "Read a study article by Author Amala on The Nealth Ecosystem." },
    ],
  }),
  component: ArticleDetail,
  notFoundComponent: () => <div className="p-8 text-center">Article not found.</div>,
});

function ArticleDetail() {
  const navigate = useNavigate();
  const { grantAccess } = useAccess();
  const { id } = useParams({ from: "/article/$id" });
  const article = getArticle(Number(id));
  const [thoughts, setThoughts] = useState("");
  const [showSecond, setShowSecond] = useState(false);
  const [password, setPassword] = useState("");
  const [entering, setEntering] = useState(false);

  if (!article) {
    return <div className="p-8 text-center text-foreground">Article not found.</div>;
  }

  const handleLike = async () => {
    const first = thoughts.trim();
    if (!first) return;
    // Verify the first password via a security-definer RPC. This does NOT
    // require anon SELECT access on the `passwords` table, so RLS can stay
    // locked down and passwords are never exposed to the client.
    const { data } = await supabase.rpc("verify_passport_first", { code: first });
    if (data === true) {
      setShowSecond(true);
    }
    // otherwise: normal like, nothing dramatic happens
  };

  const handleValidate = async () => {
    const first = thoughts.trim();
    const second = password.trim();
    if (!first || !second) return;
    // Grant access ONLY when BOTH passwords match the same row in Supabase.
    const { data } = await supabase.rpc("verify_passport_both", {
      code1: first,
      code2: second,
    });
    if (data === true) {
      grantAccess();
      setEntering(true);
    }
    // wrong: absolutely nothing happens, no error
  };

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      {entering && <PrivateHubTransition onComplete={() => navigate({ to: "/hub" })} />}
      <div className="mx-auto max-w-2xl px-5 pb-16 pt-5">
        <Link
          to="/"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#c9a84c] text-[#c9a84c]"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>

        <h1 className="mt-5 font-heading text-2xl font-bold leading-snug text-neutral-900">
          {article.title}
        </h1>
        <div className="mt-2 flex items-center gap-3 text-sm text-neutral-500">
          <span className="italic">{article.author}</span>
          <span>·</span>
          <span>{article.date}</span>
        </div>

        <article className="mt-5 space-y-4 text-[15px] leading-relaxed text-neutral-800">
          {article.body.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </article>

        {/* Reader Reflections */}
        <section className="mt-10">
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-gradient-to-r from-transparent to-[#c9a84c]" />
            <span className="font-heading text-sm font-semibold tracking-[0.2em] text-[#9a7d2e]">
              READER REFLECTIONS
            </span>
            <span className="h-px flex-1 bg-gradient-to-l from-transparent to-[#c9a84c]" />
          </div>

          <div className="mt-5 rounded-lg border border-[#c9a84c]/50 bg-[#faf6ec] p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
              <textarea
                value={thoughts}
                onChange={(e) => setThoughts(e.target.value)}
                placeholder="Share your thoughts..."
                rows={3}
                className="w-full resize-none rounded-md border border-[#c9a84c]/60 bg-white px-3 py-2 text-sm text-neutral-800 outline-none focus:border-[#c9a84c]"
              />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-1">
                <ReflectBtn icon={<Send className="h-3.5 w-3.5" />} label="SUBMIT" onClick={() => setThoughts("")} />
                <ReflectBtn icon={<Pencil className="h-3.5 w-3.5" />} label="SUGGEST EDITS" />
                <ReflectBtn icon={<Heart className="h-3.5 w-3.5" />} label="LIKE ARTICLE" onClick={handleLike} />
                <ReflectBtn icon={<List className="h-3.5 w-3.5" />} label="VIEW ALL" />
              </div>
            </div>

            {showSecond && (
              <div className="animate-slide-down mt-4 flex flex-col gap-2 sm:flex-row">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your final password..."
                  className="flex-1 rounded-md border border-[#c9a84c]/60 bg-white px-3 py-2 text-sm text-neutral-800 outline-none focus:border-[#c9a84c]"
                />
                <button
                  onClick={handleValidate}
                  className="rounded-md border border-[#c9a84c] bg-[#1a1a1a] px-5 py-2 font-heading text-sm tracking-wide text-[#c9a84c] transition-colors hover:bg-[#c9a84c] hover:text-[#1a1a1a]"
                >
                  VALIDATE
                </button>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function ReflectBtn({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-between gap-2 rounded-md border border-[#c9a84c] bg-[#1a1a1a] px-3 py-2 font-heading text-[11px] tracking-wide text-[#c9a84c] transition-colors hover:bg-[#c9a84c] hover:text-[#1a1a1a]"
    >
      <span className="truncate">{label}</span>
      {icon}
    </button>
  );
}