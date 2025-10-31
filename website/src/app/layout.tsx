import { Header } from "@/components/layout/Header";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v15-appRouter";
import { ThemeProviderClient } from "../../public/theme";
import "./globals.css";
import styles from "./page.module.css";

export const metadata = {
    title: "Example Web Client",
    description: "Example web client used to interact with the Pelican Platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <AppRouterCacheProvider>
                <ThemeProviderClient>
                    <body>
                        <Header />
                        <main className={styles.main}>{children}</main>
                    </body>
                </ThemeProviderClient>
            </AppRouterCacheProvider>
        </html>
    );
}
