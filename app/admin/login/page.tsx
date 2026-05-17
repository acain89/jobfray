import AdminLoginForm from "@/components/AdminLoginForm";

export default function AdminLoginPage(): React.ReactElement {
  return (
    <main className="min-h-screen px-4 py-4">
      <section className="mx-auto flex max-w-lg flex-col gap-5">
        <AdminLoginForm />
      </section>
    </main>
  );
}