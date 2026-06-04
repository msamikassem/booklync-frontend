"use client";

import { Suspense } from "react";
import AcceptInvite from "@/screens/AcceptInvite";

/**
 * AcceptInvite reads the `?token=` query via useSearchParams(), which Next
 * requires to sit inside a Suspense boundary.
 */
export default function AcceptInvitePage() {
  return (
    <Suspense>
      <AcceptInvite />
    </Suspense>
  );
}
