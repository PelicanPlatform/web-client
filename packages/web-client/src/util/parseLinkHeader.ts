/**
 * Parse a link header into an array of objects with url and rel properties
 */
export function parseLinkHeader(
    header: string | null
): { url: string; rel: string; pri: number; depth: number }[] | null {
    if (header === null) {
        return [];
    }

    // Split the header into individual links
    return header.split(",").map((link) => {
        // Split each link into its URL and parameters
        const [urlPart, ...paramParts] = link.split(";").map((part) => part.trim());

        // Extract the URL, removing angle brackets
        const url = urlPart.slice(1, -1);

        // Initialize rel, pri, and depth with default values
        let rel = "";
        let pri = 0;
        let depth = 0;

        // Process each parameter to extract rel, pri, and depth
        paramParts.forEach((param) => {
            const [key, value] = param.split("=").map((part) => part.trim());
            if (key === "rel") {
                rel = value.replace(/"/g, ""); // Remove quotes if present
            } else if (key === "pri") {
                pri = parseInt(value.replace(/"/g, ""), 10); // Convert to integer
            } else if (key === "depth") {
                depth = parseInt(value.replace(/"/g, ""), 10); // Convert to integer
            }
        });

        return { url, rel, pri, depth };
    });
}

export default parseLinkHeader;
