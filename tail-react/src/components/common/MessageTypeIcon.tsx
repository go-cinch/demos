import { BellAltIcon, InfoIcon } from "@/icons";
export default function MessageTypeIcon({
  type,
  label,
}: {
  type: "notice" | "system";
  label: string;
}) {
  const Icon = type === "notice" ? BellAltIcon : InfoIcon;
  return (
    <span
      role="img"
      aria-label={label}
      className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-500 dark:bg-brand-500/10"
    >
      <Icon className="size-5" aria-hidden="true" />
    </span>
  );
}
