import type { ImgHTMLAttributes } from "react";
// Only Next Image's rendering adapter changes; actual component/assets remain.
export default function ImageStub({ unoptimized: _unoptimized, priority: _priority, ...props }: ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean; priority?: boolean }) {
  return <img {...props} />;
}
