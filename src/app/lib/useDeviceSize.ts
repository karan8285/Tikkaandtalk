import { useState, useEffect } from "react";

export type DeviceSize = "mobile" | "tablet" | "desktop";

interface DeviceSizeInfo {
  device: DeviceSize;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  width: number;
  height: number;
}

export function useDeviceSize(): DeviceSizeInfo {
  const [size, setSize] = useState<DeviceSizeInfo>(() => getSize());

  function getSize(): DeviceSizeInfo {
    const width = typeof window !== "undefined" ? window.innerWidth : 375;
    const height = typeof window !== "undefined" ? window.innerHeight : 812;
    const device: DeviceSize =
      width < 640 ? "mobile" : width < 1024 ? "tablet" : "desktop";

    return {
      device,
      isMobile: device === "mobile",
      isTablet: device === "tablet",
      isDesktop: device === "desktop",
      width,
      height,
    };
  }

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const handleResize = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => setSize(getSize()), 100);
    };
    window.addEventListener("resize", handleResize);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return size;
}
