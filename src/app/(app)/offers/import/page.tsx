import { redirect } from "next/navigation";

// Загрузка списком убрана — офферы заводятся в карточке рекламодателя.
export default function ImportPage() {
  redirect("/offers");
}
