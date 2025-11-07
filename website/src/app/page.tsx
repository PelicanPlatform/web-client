import { Suspense } from "react";

import HomePageClient from "./HomePageClient";

export default function Page() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <HomePageClient />
        </Suspense>
    );
}

