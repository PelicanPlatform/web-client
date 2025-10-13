import "./globals.css";
import { Header } from "@/components/layout/Header";
import { Box } from "@mui/material";
import { ThemeProviderClient } from "../../public/theme";
import styles from "./page.module.css";

export const metadata = {
    title: "Example Web Client",
    description: "Example web client used to interact with the Pelican Platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <ThemeProviderClient>
                <body>
                    <Header />
                    <main className={styles.main}>{children}</main>
                </body>
            </ThemeProviderClient>
        </html>
    );
}
