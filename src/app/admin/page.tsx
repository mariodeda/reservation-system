"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { am } from "@/i18n";

export default function AdminLanding() {
  const router = useRouter();
  const [slug, setSlug] = useState("");

  function go(e: React.FormEvent) {
    e.preventDefault();
    const s = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (s) router.push(`/admin/${s}/login`);
  }

  return (
    <main data-admin className="min-h-screen flex items-center justify-center bg-background px-4">
      <form
        onSubmit={go}
        className="w-full max-w-sm bg-surface-container rounded-xl border border-outline-variant/30 p-8 shadow-2xl space-y-5"
      >
        <div className="text-center mb-2">
          <div className="font-display-lg text-[22px] text-primary uppercase tracking-tighter">
            {am.landing.title}
          </div>
          <p className="text-on-surface-variant text-sm mt-1">{am.landing.subtitle}</p>
        </div>
        <label className="block">
          <span className="text-xs uppercase tracking-widest text-on-surface-variant">{am.landing.code}</span>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            autoFocus
            placeholder="acme"
            className="mt-1 w-full bg-surface-container-high border border-outline-variant/30 rounded-lg p-3 text-on-surface focus:border-primary outline-none"
          />
        </label>
        <button
          type="submit"
          className="w-full bg-primary text-on-primary font-label-lg text-label-lg py-3 rounded-lg hover:brightness-110 transition"
        >
          {am.landing.continue}
        </button>
      </form>
    </main>
  );
}
