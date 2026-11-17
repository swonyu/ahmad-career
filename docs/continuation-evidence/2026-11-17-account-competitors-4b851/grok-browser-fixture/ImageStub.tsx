import type { ImgHTMLAttributes } from "react";
// Only Next's image renderer is substituted; the component, artwork asset,
// dimensions, accessible name, and browser image layout remain real.
export default function ImageStub({ unoptimized: _unoptimized, priority: _priority, ...props }: ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean; priority?: boolean }) {
  return <img {...props} />;
}
