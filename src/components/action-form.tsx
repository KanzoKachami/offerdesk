"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { PendingContext } from "@/components/pending-context";

/** Форма серверного действия. Сама вызывает действие, показывает спиннер на кнопке
 *  и обновляет страницу на месте (без прыжка наверх) — свежие данные приходят в ответе действия.
 *  Встроенный механизм форм React здесь специально не используется: вместе с обновлением
 *  страницы он иногда «подвешивал» кнопку в состоянии ожидания. */
export function ActionForm({
  action,
  children,
  className,
  id,
}: {
  action: (fd: FormData) => Promise<void>;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    setPending(true);
    try {
      // Действие само возвращает свежую страницу (revalidatePath) — отдельный refresh не нужен
      await action(fd);
      form.reset();
    } finally {
      setPending(false);
    }
  }

  return (
    <PendingContext.Provider value={pending}>
      <form id={id} className={className} onSubmit={onSubmit}>
        {children}
      </form>
    </PendingContext.Provider>
  );
}
