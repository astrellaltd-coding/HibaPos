"use client";

import { cn } from "@/lib/utils";
import { useState } from "react";

/** Render a product/addon image: emoji glyph or real <img> with lazy loading + skeleton. */
export function ProductImage({
  image,
  alt,
  className,
  glyphClassName,
}: {
  image: string | null | undefined;
  alt: string;
  className?: string;
  glyphClassName?: string;
}) {
  const isEmoji = !image || (!image.startsWith("http") && !image.startsWith("/") && !image.startsWith("data:") && image.length <= 8);
  const [loaded, setLoaded] = useState(false);

  if (isEmoji) {
    return (
      <div className={cn("flex items-center justify-center bg-gradient-to-br from-amber-50 to-orange-100/60 dark:from-amber-950/30 dark:to-orange-950/20", className)}>
        <span className={cn("select-none", glyphClassName)}>{image || "🍽️"}</span>
      </div>
    );
  }
  return (
    <div className={cn("relative overflow-hidden", className)}>
      {!loaded && (
        <div className="absolute inset-0 animate-pulse bg-muted" />
      )}
      <img
        src={image}
        alt={alt}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        className={cn(
          "h-full w-full object-contain transition-opacity duration-200",
          loaded ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}
