import Image from "next/image";

/** Public asset used for favicon and brand placeholders. */
export const GREENCO_LOGO_SRC = "https://staging.greenco.in/app-assets/images/logo/greenco.png";

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
  let roundedClass = "";
  if (rounded === "full") roundedClass = "rounded-full";
  else if (rounded === "lg") roundedClass = "rounded-2xl";
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
