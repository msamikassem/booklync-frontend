import { redirect } from "next/navigation";

/**
 * Root "/" on a Booklync host → the dashboard (RouteGuard there bounces
 * unauthenticated visitors to /login). On a customer's custom domain, the
 * request never reaches here — middleware rewrites it to the public booking
 * page before routing.
 */
export default function RootIndex() {
  redirect("/dashboard");
}
