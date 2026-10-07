import { redirect } from "next/navigation";

// «Запуски» переименованы в «Потоки».
export default function LaunchesPage() {
  redirect("/streams");
}
