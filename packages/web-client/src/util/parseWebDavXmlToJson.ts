import { ObjectList } from "../types";

/**
 * Parses a WebDAV XML multistatus response into a JSON array of resources.
 */
function parseWebDavXmlToJson(xml: string): ObjectList[] {
    if (!xml || typeof xml !== "string") return [];
    let doc: Document;
    try {
        // DOMParser is available in browser and some Node.js environments
        doc = new (window.DOMParser || require("xmldom").DOMParser)().parseFromString(xml, "application/xml");
    } catch (e) {
        // Fallback: return empty array if parsing fails
        return [];
    }
    const responses = Array.from(doc.getElementsByTagName("D:response"));
    return responses.map((resp) => {
        const getText = (tag: string) => {
            const el = resp.getElementsByTagName(tag)[0];
            return el ? el.textContent || "" : "";
        };
        const href = getText("D:href");
        const getcontentlength = Number(getText("lp1:getcontentlength"));
        const getlastmodified = getText("lp1:getlastmodified");
        // Resource type: collection or empty string
        const resourcetypeEl = resp.getElementsByTagName("lp1:resourcetype")[0];
        let resourcetype = "";
        if (resourcetypeEl && resourcetypeEl.getElementsByTagName("D:collection").length > 0) {
            resourcetype = "collection";
        }
        const iscollection = getText("lp1:iscollection") === "1";
        const executable = getText("lp1:executable");
        const status = getText("D:status");
        return {
            href,
            getcontentlength,
            getlastmodified,
            resourcetype,
            iscollection,
            executable,
            status,
        };
    });
}

export default parseWebDavXmlToJson;
