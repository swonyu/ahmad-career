import React from "react";
import type { ImgHTMLAttributes } from "react";

// Next's image runtime is not present on this standalone test page. Preserve the
// actual bundled data-URL artwork while replacing only its rendering adapter.
export default function Image({ unoptimized: _unoptimized, ...props }: ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) {
  void _unoptimized;
  // eslint-disable-next-line @next/next/no-img-element
  return <img {...props} alt={props.alt ?? ""} />;
}
