export function PatientAvatar({ sex, age, size = "md" }: { sex: "male" | "female"; age: number; size?: "sm" | "md" | "lg" }) {
  const emoji = sex === "male" ? (age >= 60 ? "👴🏻" : age >= 35 ? "👨🏻" : "🧑🏻") : age >= 60 ? "👵🏻" : age >= 18 ? "👩🏻" : "👧🏻";
  const sizes = { sm: "h-8 w-8 text-base", md: "h-12 w-12 text-2xl", lg: "h-16 w-16 text-3xl" };
  return (
    <span aria-hidden className={`inline-flex shrink-0 items-center justify-center rounded-full bg-amber-100 ring-2 ring-white ${sizes[size]}`}>
      {emoji}
    </span>
  );
}
