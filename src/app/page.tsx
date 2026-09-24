import { redirect } from "next/navigation";

// Signed-out users are sent on to /login by the proxy.
export default function Home() {
  redirect("/boards");
}
