import Image from "next/image";

/** Public asset used for favicon (see root layout metadata) and brand placeholders. */
export const GREENCO_LOGO_SRC = "/greenco.png";

type GreencoLogoProps = Readonly<{
  className?: string;
  width?: number;
  height?: number;
  rounded?: "none" | "lg" | "full";
  alt?: string;
}>;

export function GreencoLogo({
  className = "",
  width = 48,
  height = 48,
  rounded = "none",
  alt = "Greenco",
}: GreencoLogoProps) {
  const roundedClass = rounded === "full" ? "rounded-full" : rounded === "lg" ? "rounded-2xl" : "";
  return (
    <Image
      src={GREENCO_LOGO_SRC}
      alt={alt}
      width={width}
      height={height}
      className={`object-contain ${roundedClass} ${className}`.trim()}
      sizes={`${width}px`}
    />
  );
}
