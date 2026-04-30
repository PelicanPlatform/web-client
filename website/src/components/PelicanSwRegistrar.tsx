"use client";

import { useEffect } from "react";
import { registerPelicanSw } from "@pelicanplatform/web-client";

export default function PelicanSwRegistrar() {
  useEffect(() => {
    registerPelicanSw("/downloadServiceWorker.js");
  }, []);

  return null;
}
