import { redirect } from "next/navigation";

/** News is the only thing left to administer here. */
export default function AdminPage() {
  redirect("/admin/news");
}
