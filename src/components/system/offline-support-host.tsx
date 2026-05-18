"use client";

import dynamic from "next/dynamic";

const OfflineSupport = dynamic(() => import("@/components/system/offline-support"), {
  ssr: false,
});

export default function OfflineSupportHost() {
  return <OfflineSupport />;
}
