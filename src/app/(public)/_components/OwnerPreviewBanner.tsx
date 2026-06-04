"use client";

import { useEffect, useState } from "react";
import { storage } from "@/auth/storage";

/**
 * Shows a preview banner when the logged-in operator owns/accesses this branch.
 *
 * Reads the cached agents list from localStorage, so it must be a client
 * component — and it stays mount-gated (renders nothing on the server and the
 * first client paint, then flips in an effect). That keeps `localStorage` out
 * of the public page's server render and avoids a hydration mismatch.
 */
export default function OwnerPreviewBanner({ slug }: { slug: string | null }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!slug) return;
    const agents =
      (storage.getAgents() as Array<{ booking_page_slug?: string }> | null) ??
      [];
    // localStorage is client-only, so this read + set must run post-mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShow(agents.some((a) => a.booking_page_slug === slug));
  }, [slug]);

  if (!show) return null;
  return (
    <div className="bg-[#fefce8] border-b border-[#fde68a] px-6 py-2.5 text-center text-[13px] font-medium text-[#92400e]">
      You&apos;re previewing your booking page. This is exactly what your
      customers will see.
    </div>
  );
}
