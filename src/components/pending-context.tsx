"use client";

import { createContext, useContext } from "react";
import { useFormStatus } from "react-dom";

/** Состояние «идёт сохранение» для форм ActionForm (свой механизм, без form actions React). */
export const PendingContext = createContext<boolean>(false);

/** true, пока форма сохраняется: работает и в ActionForm, и в обычных формах с action. */
export function usePending() {
  const ctx = useContext(PendingContext);
  const { pending } = useFormStatus();
  return ctx || pending;
}
