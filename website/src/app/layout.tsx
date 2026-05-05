import { Header } from "@/components/layout/Header";
import { ThemeProviderClient } from "../../public/theme";
import "./globals.css";
import styles from "./page.module.css";
import {Box, Container } from "@mui/material";
import {PelicanClientProvider} from "@pelicanplatform/hooks";
import PelicanSwRegistrar from "@/components/PelicanSwRegistrar";


export const metadata = {
    title: "Example Web Client",
    description: "Example web client used to interact with the Pelican Platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <ThemeProviderClient>
                <body>
                    <PelicanSwRegistrar />
                    <Header />
                    <main className={styles.main}>
                      <Container maxWidth="lg">
                        <Box minHeight={"90vh"} margin={4} width={"100%"} mx={"auto"}>
                          <PelicanClientProvider initialObjectUrl={`pelican://osg-htc.org/ncar`} enableAuth={true} >
                            {children}
                          </PelicanClientProvider>
                        </Box>
                      </Container>
                    </main>
                </body>
            </ThemeProviderClient>
        </html>
    );
}
