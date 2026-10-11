import { ogAlt, ogImage, ogSize, ogType } from "@/lib/og";

export const alt = ogAlt;
export const size = ogSize;
export const contentType = ogType;

export default function Image() {
  return ogImage();
}
