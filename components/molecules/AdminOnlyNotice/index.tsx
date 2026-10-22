import { EmptyState } from "@/components/molecules/EmptyState";

export function AdminOnlyNotice() {
  return <EmptyState title="Só o Admin da empresa acessa esta área." description="Fale com quem administra a conta se precisar de algo aqui." />;
}
