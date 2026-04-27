import { ObjectList } from "../types";

/**
 * Parses a WebDAV XML multistatus response into a JSON array of resources.
 */
function parseWebDavXmlToJson(xml: string): ObjectList[] {
    if (!xml || typeof xml !== "string") return [];

    const getTagText = (block: string, tag: string): string => {
        const match = block.match(new RegExp(`<(?:[^:>]+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:[^:>]+:)?${tag}>`, "i"));
        return match ? match[1].trim() : "";
    };

    const responseBlocks = [...xml.matchAll(/<[^:>]+:response[^>]*>([\s\S]*?)<\/[^:>]+:response>/gi)].map(m => m[0]);

    return responseBlocks.map((block) => {
        const href = getTagText(block, "href");
        const getcontentlength = Number(getTagText(block, "getcontentlength"));
        const getlastmodified = getTagText(block, "getlastmodified");
        const iscollection = getTagText(block, "iscollection") === "1";
        const executable = getTagText(block, "executable");
        const status = getTagText(block, "status");

        const resourcetypeMatch = block.match(/<(?:[^:>]+:)?resourcetype[^>]*>([\s\S]*?)<\/(?:[^:>]+:)?resourcetype>/i);
        const resourcetype = resourcetypeMatch && /collection/i.test(resourcetypeMatch[1]) ? "collection" : "";

        return { href, getcontentlength, getlastmodified, resourcetype, iscollection, executable, status };
    });
}

export default parseWebDavXmlToJson;
