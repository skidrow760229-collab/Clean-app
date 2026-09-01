import { Console } from "@/components/console/console"
import { AdminLogin } from "@/components/admin-login"
import { isAuthed, isAdminConfigured } from "@/lib/admin-auth"

export const dynamic = "force-dynamic"

export default async function Page() {
  const authed = await isAuthed()
  if (!authed) {
    return <AdminLogin configured={isAdminConfigured()} />
  }
  return <Console />
}
