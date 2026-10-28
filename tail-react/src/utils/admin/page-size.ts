"use client";
import { useEffect, useState } from "react";
const key = "go-cinch-pc-default-page-size";
function read() {
  if (typeof window === "undefined") return 20;
  const value = Number(localStorage.getItem(key));
  return Number.isInteger(value) && value >= 10 && value <= 200 ? value : 20;
}
export function setDefaultPageSize(value: number) {
  if (!Number.isInteger(value) || value < 10 || value > 200) return;
  localStorage.setItem(key, String(value));
  window.dispatchEvent(new Event("cinch-page-size-changed"));
}
export function useDefaultPageSize() {
  const [size, setSize] = useState(read);
  useEffect(() => {
    const changed = () => setSize(read());
    window.addEventListener("cinch-page-size-changed", changed);
    window.addEventListener("storage", changed);
    return () => {
      window.removeEventListener("cinch-page-size-changed", changed);
      window.removeEventListener("storage", changed);
    };
  }, []);
  return size;
}
